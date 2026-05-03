const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── NBT helpers ────────────────────────────────────────────────────────────────

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }
function i32(n) { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; }

function nbtStr(s)          { const sb = Buffer.from(s, 'utf8'); return Buffer.concat([u16(sb.length), sb]); }
function named(type, k, v)  { return Buffer.concat([Buffer.from([type]), nbtStr(k), v]); }
function tagString(k, v)    { return named(8, k, nbtStr(v)); }
function tagByte(k, v)      { return named(1, k, Buffer.from([v])); }
const END = Buffer.from([0]);

function serverEntryBuf({ ip, name, acceptTextures }) {
  const parts = [tagString('ip', ip), tagString('name', name || ip)];
  if (acceptTextures !== undefined) parts.push(tagByte('acceptTextures', acceptTextures));
  parts.push(END);
  return Buffer.concat(parts);
}

function buildServersDat(servers) {
  const entries = servers.map(serverEntryBuf);
  const listPayload = Buffer.concat([Buffer.from([10]), i32(entries.length), ...entries]);
  const listTag = named(9, 'servers', listPayload);
  return zlib.gzipSync(Buffer.concat([Buffer.from([10, 0, 0]), listTag, END]));
}

// ── Minimal NBT skip helper (needed to parse existing servers.dat) ─────────────

function skipPayload(buf, pos, type) {
  switch (type) {
    case 1: return pos + 1;
    case 2: return pos + 2;
    case 3: return pos + 4;
    case 4: return pos + 8;
    case 5: return pos + 4;
    case 6: return pos + 8;
    case 7: return pos + 4 + buf.readInt32BE(pos);
    case 8: return pos + 2 + buf.readUInt16BE(pos);
    case 9: {
      const et = buf[pos++]; const cnt = buf.readInt32BE(pos); pos += 4;
      for (let i = 0; i < cnt; i++) pos = skipPayload(buf, pos, et);
      return pos;
    }
    case 10: {
      while (true) {
        const t = buf[pos++]; if (t === 0) break;
        const nl = buf.readUInt16BE(pos); pos += 2 + nl;
        pos = skipPayload(buf, pos, t);
      }
      return pos;
    }
    case 11: return pos + 4 + buf.readInt32BE(pos) * 4;
    case 12: return pos + 4 + buf.readInt32BE(pos) * 8;
    default: return buf.length;
  }
}

function parseServersDat(filePath) {
  try {
    const buf = zlib.gunzipSync(fs.readFileSync(filePath));
    let pos = 3; // skip root compound header (type=10, name len=0)
    const servers = [];

    while (pos < buf.length) {
      const type = buf[pos++];
      if (type === 0) break;
      const nameLen = buf.readUInt16BE(pos); pos += 2;
      const name = buf.slice(pos, pos + nameLen).toString('utf8'); pos += nameLen;

      if (type === 9 && name === 'servers') {
        const elemType = buf[pos++];
        const count = buf.readInt32BE(pos); pos += 4;
        if (elemType === 10) {
          for (let i = 0; i < count; i++) {
            const srv = {};
            while (pos < buf.length) {
              const t = buf[pos++]; if (t === 0) break;
              const nl = buf.readUInt16BE(pos); pos += 2;
              const n = buf.slice(pos, pos + nl).toString('utf8'); pos += nl;
              if (t === 8) {
                const vl = buf.readUInt16BE(pos); pos += 2;
                srv[n] = buf.slice(pos, pos + vl).toString('utf8'); pos += vl;
              } else {
                pos = skipPayload(buf, pos, t);
              }
            }
            if (srv.ip) servers.push(srv);
          }
        }
      } else {
        pos = skipPayload(buf, pos, type);
      }
    }
    return servers;
  } catch (_) {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

function ensureServer(mcDir, ip, name) {
  const file = path.join(mcDir, 'servers.dat');
  let servers = fs.existsSync(file) ? parseServersDat(file) : [];

  // Match with or without explicit default port
  const host = ip.split(':')[0];
  const alreadyPresent = servers.some(s => {
    const existingHost = (s.ip || '').split(':')[0];
    return existingHost === host;
  });
  if (alreadyPresent) return;

  servers = [{ ip, name, acceptTextures: 1 }, ...servers];
  fs.mkdirSync(mcDir, { recursive: true });
  fs.writeFileSync(file, buildServersDat(servers));
}

function ensureResourcePack(mcDir, packFileName) {
  const optionsFile = path.join(mcDir, 'options.txt');
  if (!fs.existsSync(optionsFile)) return; // Minecraft hasn't run yet — it'll use default options

  let lines = fs.readFileSync(optionsFile, 'utf8').split('\n');
  const key = 'resourcePacks:';
  const idx = lines.findIndex(l => l.startsWith(key));
  const entry = `file/${packFileName}`;

  if (idx === -1) {
    lines.push(`${key}["vanilla","fabric","${entry}"]`);
  } else {
    try {
      const jsonPart = lines[idx].slice(key.length);
      const arr = JSON.parse(jsonPart);
      if (!arr.includes(entry)) {
        arr.push(entry);
        lines[idx] = key + JSON.stringify(arr);
      }
    } catch (_) { /* leave untouched if malformed */ }
  }

  fs.writeFileSync(optionsFile, lines.join('\n'), 'utf8');
}

function ensureShader(mcDir, shaderFileName) {
  // Iris (Fabric)
  const irisDir  = path.join(mcDir, 'config');
  const irisFile = path.join(irisDir, 'iris.properties');
  fs.mkdirSync(irisDir, { recursive: true });

  if (fs.existsSync(irisFile)) {
    let content = fs.readFileSync(irisFile, 'utf8');
    if (/^shaderPack=/m.test(content)) {
      content = content.replace(/^shaderPack=.*/m, `shaderPack=${shaderFileName}`);
    } else {
      content += `\nshaderPack=${shaderFileName}`;
    }
    fs.writeFileSync(irisFile, content, 'utf8');
  } else {
    fs.writeFileSync(irisFile, `shaderPack=${shaderFileName}\n`, 'utf8');
  }

  // OptiFine fallback
  const optFile = path.join(mcDir, 'optionsshaders.txt');
  if (fs.existsSync(optFile)) {
    let content = fs.readFileSync(optFile, 'utf8');
    if (/^shaderPack=/m.test(content)) {
      content = content.replace(/^shaderPack=.*/m, `shaderPack=${shaderFileName}`);
    } else {
      content += `\nshaderPack=${shaderFileName}`;
    }
    fs.writeFileSync(optFile, content, 'utf8');
  }
}

module.exports = { ensureServer, ensureResourcePack, ensureShader };
