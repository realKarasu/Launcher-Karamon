import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

interface ServerEntry {
  ip: string;
  name?: string;
  acceptTextures?: number;
}

class NBT {
  static u16(n: number): Buffer {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return b;
  }

  static i32(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
  }

  static str(s: string): Buffer {
    const sb = Buffer.from(s, 'utf8');
    return Buffer.concat([NBT.u16(sb.length), sb]);
  }

  static named(type: number, key: string, payload: Buffer): Buffer {
    return Buffer.concat([Buffer.from([type]), NBT.str(key), payload]);
  }

  static tagString(k: string, v: string): Buffer {
    return NBT.named(TAG_STRING, k, NBT.str(v));
  }

  static tagByte(k: string, v: number): Buffer {
    return NBT.named(TAG_BYTE, k, Buffer.from([v]));
  }

  static get END(): Buffer {
    return Buffer.from([TAG_END]);
  }

  static skipPayload(buf: Buffer, pos: number, type: number): number {
    switch (type) {
      case 1:
        return pos + 1;
      case 2:
        return pos + 2;
      case 3:
        return pos + 4;
      case 4:
        return pos + 8;
      case 5:
        return pos + 4;
      case 6:
        return pos + 8;
      case 7:
        return pos + 4 + buf.readInt32BE(pos);
      case 8:
        return pos + 2 + buf.readUInt16BE(pos);
      case 9: {
        const elemType = buf[pos++];
        const count = buf.readInt32BE(pos);
        pos += 4;
        for (let i = 0; i < count; i++) pos = NBT.skipPayload(buf, pos, elemType);
        return pos;
      }
      case 10: {
        for (;;) {
          const t = buf[pos++];
          if (t === TAG_END) break;
          const nameLen = buf.readUInt16BE(pos);
          pos += 2 + nameLen;
          pos = NBT.skipPayload(buf, pos, t);
        }
        return pos;
      }
      case 11:
        return pos + 4 + buf.readInt32BE(pos) * 4;
      case 12:
        return pos + 4 + buf.readInt32BE(pos) * 8;
      default:
        return buf.length;
    }
  }
}

export class ServersDat {
  private readonly dir: string;
  private readonly file: string;

  constructor(mcDir: string) {
    this.dir = mcDir;
    this.file = path.join(mcDir, 'servers.dat');
  }

  ensureServer(ip: string, name: string): void {
    const servers = fs.existsSync(this.file) ? this.read() : [];
    const targetHost = ip.split(':')[0];
    const alreadyPresent = servers.some((s) => (s.ip || '').split(':')[0] === targetHost);
    if (alreadyPresent) return;

    const updated: ServerEntry[] = [{ ip, name, acceptTextures: 1 }, ...servers];
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, this.encode(updated));
  }

  private encode(servers: ServerEntry[]): Buffer {
    const entries = servers.map((s) => {
      const parts: Buffer[] = [
        NBT.tagString('ip', s.ip),
        NBT.tagString('name', s.name || s.ip),
      ];
      if (s.acceptTextures !== undefined) parts.push(NBT.tagByte('acceptTextures', s.acceptTextures));
      parts.push(NBT.END);
      return Buffer.concat(parts);
    });

    const listPayload = Buffer.concat([
      Buffer.from([TAG_COMPOUND]),
      NBT.i32(entries.length),
      ...entries,
    ]);
    const listTag = NBT.named(TAG_LIST, 'servers', listPayload);
    return zlib.gzipSync(Buffer.concat([Buffer.from([TAG_COMPOUND, 0, 0]), listTag, NBT.END]));
  }

  private read(): ServerEntry[] {
    try {
      const buf = zlib.gunzipSync(fs.readFileSync(this.file));
      let pos = 3;
      const out: ServerEntry[] = [];

      while (pos < buf.length) {
        const type = buf[pos++];
        if (type === TAG_END) break;
        const nameLen = buf.readUInt16BE(pos);
        pos += 2;
        const name = buf.slice(pos, pos + nameLen).toString('utf8');
        pos += nameLen;

        if (type === TAG_LIST && name === 'servers') {
          pos = this.readServerList(buf, pos, out);
        } else {
          pos = NBT.skipPayload(buf, pos, type);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  private readServerList(buf: Buffer, pos: number, out: ServerEntry[]): number {
    const elemType = buf[pos++];
    const count = buf.readInt32BE(pos);
    pos += 4;
    if (elemType !== TAG_COMPOUND) return pos;

    for (let i = 0; i < count; i++) {
      const entry: Partial<ServerEntry> = {};
      while (pos < buf.length) {
        const t = buf[pos++];
        if (t === TAG_END) break;
        const nameLen = buf.readUInt16BE(pos);
        pos += 2;
        const name = buf.slice(pos, pos + nameLen).toString('utf8');
        pos += nameLen;
        if (t === TAG_STRING) {
          const valLen = buf.readUInt16BE(pos);
          pos += 2;
          (entry as Record<string, unknown>)[name] = buf.slice(pos, pos + valLen).toString('utf8');
          pos += valLen;
        } else {
          pos = NBT.skipPayload(buf, pos, t);
        }
      }
      if (entry.ip) out.push(entry as ServerEntry);
    }
    return pos;
  }
}
