import net from 'net';
import type { PingResult } from '../../../ipc/contract';

class VarInt {
  static write(value: number): Buffer {
    const bytes: number[] = [];
    do {
      let b = value & 0x7f;
      value >>>= 7;
      if (value !== 0) b |= 0x80;
      bytes.push(b);
    } while (value !== 0);
    return Buffer.from(bytes);
  }

  static read(buf: Buffer, offset: number): { value: number; pos: number } {
    let value = 0;
    let shift = 0;
    let pos = offset;
    do {
      if (pos >= buf.length) throw new Error('Buffer underflow reading VarInt');
      const b = buf[pos++];
      value |= (b & 0x7f) << shift;
      shift += 7;
      if (!(b & 0x80)) break;
    } while (shift < 35);
    return { value, pos };
  }
}

interface MinecraftStatusJson {
  players?: { online?: number; max?: number; sample?: { name: string; id?: string }[] };
  description?: string | { text?: string };
  version?: { name?: string };
}

export class ServerPing {
  static readonly PROTOCOL_VERSION = 767;
  static readonly HANDSHAKE_NEXT_STATE = 1;
  static readonly STATUS_REQUEST = Buffer.from([0x01, 0x00]);

  ping(host: string, port = 25565, timeoutMs = 5000): Promise<PingResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;
      const finish = (result: PingResult): void => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => finish({ online: false }));
      socket.on('error', () => finish({ online: false }));

      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          finish(this.decodeStatus(buffer));
        } catch {
          /* keep buffering until we have a full packet */
        }
      });

      socket.connect(port, host, () => {
        socket.write(this.buildHandshake(host, port));
        socket.write(ServerPing.STATUS_REQUEST);
      });
    });
  }

  private buildHandshake(host: string, port: number): Buffer {
    const hostBuf = Buffer.from(host, 'utf8');
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(port);
    const payload = Buffer.concat([
      VarInt.write(0x00),
      VarInt.write(ServerPing.PROTOCOL_VERSION),
      VarInt.write(hostBuf.length),
      hostBuf,
      portBuf,
      VarInt.write(ServerPing.HANDSHAKE_NEXT_STATE),
    ]);
    return Buffer.concat([VarInt.write(payload.length), payload]);
  }

  private decodeStatus(buf: Buffer): PingResult {
    const { value: pktLen, pos: pktStart } = VarInt.read(buf, 0);
    if (buf.length < pktStart + pktLen) throw new Error('Incomplete packet');

    const pkt = buf.slice(pktStart, pktStart + pktLen);
    const { pos: idEnd } = VarInt.read(pkt, 0);
    const { value: strLen, pos: strStart } = VarInt.read(pkt, idEnd);
    const json = pkt.slice(strStart, strStart + strLen).toString('utf8');
    const data = JSON.parse(json) as MinecraftStatusJson;

    const description = data.description;
    const motd = typeof description === 'string' ? description : description?.text ?? '';

    return {
      online: true,
      players: data.players?.online ?? 0,
      maxPlayers: data.players?.max ?? 0,
      motd,
      version: data.version?.name ?? '',
      sample: data.players?.sample?.map((s) => ({ name: s.name, id: s.id })),
    };
  }
}
