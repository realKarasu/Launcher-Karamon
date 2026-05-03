const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const http  = require('http');

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
  const key   = 'resourcePacks:';
  const entry = `file/${packFileName}`;

  if (!fs.existsSync(optionsFile)) {
    // Create a minimal options.txt so Minecraft picks up the resource pack on first launch
    fs.mkdirSync(mcDir, { recursive: true });
    fs.writeFileSync(optionsFile, `${key}["vanilla","fabric","${entry}"]\n`, 'utf8');
    return;
  }

  let lines = fs.readFileSync(optionsFile, 'utf8').split('\n');
  const idx = lines.findIndex(l => l.startsWith(key));

  if (idx === -1) {
    lines.push(`${key}["vanilla","fabric","${entry}"]`);
  } else {
    try {
      const arr = JSON.parse(lines[idx].slice(key.length));
      if (!arr.includes(entry)) {
        arr.push(entry);
        lines[idx] = key + JSON.stringify(arr);
      }
    } catch (_) {}
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

// ── HTTP helper (follows redirects) ───────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    function doGet(targetUrl) {
      const lib = targetUrl.startsWith('https') ? https : http;
      lib.get(targetUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return doGet(res.headers.location);
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    }
    doGet(url);
  });
}

// ── Fabric version JSON ───────────────────────────────────────────────────────

const MC_VERSION      = '1.21.1';
const FABRIC_VERSION  = '0.19.2';
const FABRIC_ID       = `fabric-loader-${FABRIC_VERSION}-${MC_VERSION}`;
const FABRIC_META_URL = `https://meta.fabricmc.net/v2/versions/loader/${MC_VERSION}/${FABRIC_VERSION}/profile/json`;

async function ensureFabricVersion(mcDir) {
  const versionDir  = path.join(mcDir, 'versions', FABRIC_ID);
  const versionJson = path.join(versionDir, `${FABRIC_ID}.json`);

  if (fs.existsSync(versionJson)) return; // already installed

  const json = await fetchText(FABRIC_META_URL);
  // Validate it's real JSON with the expected id
  const parsed = JSON.parse(json);
  if (!parsed.id || !parsed.id.includes('fabric')) {
    throw new Error('Réponse Fabric meta invalide');
  }

  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(versionJson, json, 'utf8');
}

// ── Minecraft launcher profile ────────────────────────────────────────────────

// mcLauncherDir = .minecraft  (where launcher_profiles.json lives)
// gameDir       = .karamon-launcher/instances/Karamon  (where mods/servers.dat/… live)
function ensureProfile(mcLauncherDir, gameDir, config) {
  const profilesFile = path.join(mcLauncherDir, 'launcher_profiles.json');

  let data = { profiles: {}, settings: {}, version: 3 };
  if (fs.existsSync(profilesFile)) {
    try { data = JSON.parse(fs.readFileSync(profilesFile, 'utf8')); }
    catch (_) {}
  }
  if (!data.profiles) data.profiles = {};

  const memMb    = config.memoryMb || 12288;
  const jvmBase  = `-Xmx${memMb}m -Xms512m -XX:+UseG1GC -XX:MaxGCPauseMillis=50`;
  const javaArgs = config.jvmArgs ? `${jvmBase} ${config.jvmArgs}` : jvmBase;

  const existingKey = Object.keys(data.profiles).find(k =>
    k === 'Karamon' || data.profiles[k].name === 'Karamon'
  );

  const now = new Date().toISOString();
  const useCustomGameDir = path.resolve(gameDir) !== path.resolve(mcLauncherDir);

  if (existingKey) {
    const p = data.profiles[existingKey];
    p.javaArgs      = javaArgs;
    p.lastVersionId = FABRIC_ID;
    p.lastUsed      = now;
    if (useCustomGameDir) p.gameDir = gameDir;
    else delete p.gameDir;
  } else {
    const profile = {
      created:       now,
      icon:          'Grass',
      javaArgs,
      lastUsed:      now,
      lastVersionId: FABRIC_ID,
      name:          'Karamon',
      type:          'custom',
    };
    if (useCustomGameDir) profile.gameDir = gameDir;
    data.profiles['Karamon'] = profile;
  }

  fs.mkdirSync(mcLauncherDir, { recursive: true });
  fs.writeFileSync(profilesFile, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { ensureServer, ensureResourcePack, ensureShader, ensureFabricVersion, ensureProfile };
