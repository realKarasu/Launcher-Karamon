const net = require('net');

function writeVarInt(buf, value) {
  const bytes = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value !== 0) b |= 0x80;
    bytes.push(b);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buf, offset) {
  let value = 0, shift = 0, pos = offset;
  do {
    if (pos >= buf.length) throw new Error('Buffer underflow reading VarInt');
    const b = buf[pos++];
    value |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  } while (shift < 35);
  return { value, pos };
}

function buildHandshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const hostLen = writeVarInt(null, hostBuf.length);
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  const payload = Buffer.concat([
    writeVarInt(null, 0x00),
    writeVarInt(null, 754),
    hostLen, hostBuf,
    portBuf,
    writeVarInt(null, 1),
  ]);
  const lenBuf = writeVarInt(null, payload.length);
  return Buffer.concat([lenBuf, payload]);
}

function buildStatusRequest() {
  return Buffer.from([0x01, 0x00]);
}

module.exports = function pingServer(host, port = 25565, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const done = (result) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => done({ online: false }));
    socket.on('error', () => done({ online: false }));

    let rawBuf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      rawBuf = Buffer.concat([rawBuf, chunk]);
      try {
        const { value: pktLen, pos: pktStart } = readVarInt(rawBuf, 0);
        if (rawBuf.length < pktStart + pktLen) return;
        const pkt = rawBuf.slice(pktStart, pktStart + pktLen);
        const { pos: idEnd } = readVarInt(pkt, 0);
        const { value: strLen, pos: strStart } = readVarInt(pkt, idEnd);
        const json = pkt.slice(strStart, strStart + strLen).toString('utf8');
        const data = JSON.parse(json);
        done({
          online: true,
          players: data.players?.online ?? 0,
          maxPlayers: data.players?.max ?? 0,
          motd: data.description?.text ?? data.description ?? '',
          version: data.version?.name ?? '',
        });
      } catch (_) { /* wait for more data */ }
    });

    socket.connect(port, host, () => {
      socket.write(buildHandshake(host, port));
      socket.write(buildStatusRequest());
    });
  });
};
