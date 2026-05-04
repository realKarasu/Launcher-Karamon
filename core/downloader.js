const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const next = res.headers.location || '';
        if (url.startsWith('https:') && !next.startsWith('https:')) {
          reject(new Error('HTTPS→HTTP redirect blocked: ' + next));
          return;
        }
        return request(next, options).then(resolve).catch(reject);
      }
      let data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data) }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout: ' + url)); });
  });
}

async function getText(url) {
  const res = await request(url);
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.body.toString('utf8');
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

async function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  const parsed = new URL(url);
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, options, (res) => {
      let data = [];
      res.on('data', (c) => data.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function postJson(url, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  const parsed = new URL(url);
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'application/json',
      ...extraHeaders,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, options, (res) => {
      let data = [];
      res.on('data', (c) => data.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getWithAuth(url, token) {
  const parsed = new URL(url);
  const options = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, options, (res) => {
      let data = [];
      res.on('data', (c) => data.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function sha1File(filePath) {
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

// HEAD request (follows redirects), returns response headers
function head(url) {
  return new Promise((resolve, reject) => {
    function doHead(targetUrl) {
      const lib = targetUrl.startsWith('https') ? https : http;
      const req = lib.request(targetUrl, { method: 'HEAD' }, (res) => {
        res.resume(); // consume body (empty for HEAD but needed to free socket)
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = res.headers.location;
          if (targetUrl.startsWith('https:') && !next.startsWith('https:')) {
            reject(new Error('HTTPS→HTTP redirect blocked: ' + next));
            return;
          }
          return doHead(next);
        }
        resolve(res.headers);
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('HEAD timeout: ' + targetUrl)); });
      req.end();
    }
    doHead(url);
  });
}

async function download(url, dest, expectedSha1, onProgress, label) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dest) && expectedSha1) {
    const actual = sha1File(dest);
    if (actual.toLowerCase() === expectedSha1.toLowerCase()) return;
  }

  await new Promise((resolve, reject) => {
    function doGet(targetUrl) {
      const lib = targetUrl.startsWith('https') ? https : http;
      const req = lib.get(targetUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const next = res.headers.location;
          if (targetUrl.startsWith('https:') && !next.startsWith('https:')) {
            reject(new Error('HTTPS→HTTP redirect blocked for ' + (label || url)));
            return;
          }
          return doGet(next);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${label || url}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const tmp = dest + '.tmp';
        const out = fs.createWriteStream(tmp);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && total > 0) onProgress(received / total);
        });
        res.pipe(out);
        out.on('finish', () => {
          fs.renameSync(tmp, dest);
          resolve();
        });
        out.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Download timeout: ' + (label || url))); });
    }

    doGet(url);
  });

  if (expectedSha1) {
    const actual = sha1File(dest);
    if (actual.toLowerCase() !== expectedSha1.toLowerCase()) {
      throw new Error(`SHA1 mismatch for ${label || dest}: expected ${expectedSha1}, got ${actual}`);
    }
  }
}

module.exports = { getText, getJson, postForm, postJson, getWithAuth, head, download, sha1File };
