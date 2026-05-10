import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IncomingHttpHeaders } from 'http';

const REDIRECT_STATUS = new Set([301, 302, 307, 308]);
const MAX_REDIRECTS = 10;

export interface HttpResponse {
  status: number;
  body: Buffer;
}

export interface DownloadOptions {
  expectedSha1?: string;
  label?: string;
  onProgress?: (fraction: number) => void;
  timeoutMs?: number;
}

export class HttpClient {
  static assertHttps(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('URL invalide: ' + (url || '(vide)'));
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('URL non sécurisée refusée (HTTPS requis): ' + url);
    }
  }

  private static redirectTarget(location: string | string[], baseUrl: string): string {
    const value = Array.isArray(location) ? location[0] : location;
    if (!value) throw new Error('Redirection invalide: ' + baseUrl);
    const next = new URL(value, baseUrl).toString();
    HttpClient.assertHttps(next);
    return next;
  }

  static sha1File(filePath: string): string {
    const hash = crypto.createHash('sha1');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  get(url: string, { timeoutMs = 30000 }: { timeoutMs?: number } = {}): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const fetchUrl = (target: string, redirects = 0): void => {
        try {
          HttpClient.assertHttps(target);
        } catch (e) {
          return reject(e);
        }
        const req = https.get(target, (res) => {
          if (res.statusCode && REDIRECT_STATUS.has(res.statusCode) && res.headers.location) {
            res.resume();
            if (redirects >= MAX_REDIRECTS) {
              return reject(new Error('Trop de redirections: ' + target));
            }
            try {
              return fetchUrl(HttpClient.redirectTarget(res.headers.location, target), redirects + 1);
            } catch (e) {
              return reject(e);
            }
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error('Request timeout: ' + target));
        });
      };
      fetchUrl(url);
    });
  }

  async getText(url: string): Promise<string> {
    const res = await this.get(url);
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.body.toString('utf8');
  }

  async getJson<T = unknown>(url: string): Promise<T> {
    return JSON.parse(await this.getText(url)) as T;
  }

  head(url: string, { timeoutMs = 10000 }: { timeoutMs?: number } = {}): Promise<IncomingHttpHeaders> {
    return new Promise((resolve, reject) => {
      const sendHead = (target: string, redirects = 0): void => {
        try {
          HttpClient.assertHttps(target);
        } catch (e) {
          return reject(e);
        }
        const req = https.request(target, { method: 'HEAD' }, (res) => {
          res.resume();
          if (res.statusCode && REDIRECT_STATUS.has(res.statusCode) && res.headers.location) {
            if (redirects >= MAX_REDIRECTS) {
              return reject(new Error('Trop de redirections: ' + target));
            }
            try {
              return sendHead(HttpClient.redirectTarget(res.headers.location, target), redirects + 1);
            } catch (e) {
              return reject(e);
            }
          }
          resolve(res.headers);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error('HEAD timeout: ' + target));
        });
        req.end();
      };
      sendHead(url);
    });
  }

  async download(url: string, dest: string, opts: DownloadOptions = {}): Promise<void> {
    const { expectedSha1 = '', label = '', onProgress, timeoutMs = 60000 } = opts;
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    if (expectedSha1 && fs.existsSync(dest)) {
      const cached = HttpClient.sha1File(dest).toLowerCase();
      if (cached === expectedSha1.toLowerCase()) return;
    }

    await new Promise<void>((resolve, reject) => {
      const fetchUrl = (target: string, redirects = 0): void => {
        try {
          HttpClient.assertHttps(target);
        } catch (e) {
          return reject(e);
        }
        const req = https.get(target, (res) => {
          if (res.statusCode && REDIRECT_STATUS.has(res.statusCode) && res.headers.location) {
            res.resume();
            if (redirects >= MAX_REDIRECTS) {
              return reject(new Error('Trop de redirections: ' + target));
            }
            try {
              return fetchUrl(HttpClient.redirectTarget(res.headers.location, target), redirects + 1);
            } catch (e) {
              return reject(e);
            }
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} downloading ${label || url}`));
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          const tmp = dest + '.tmp';
          const out = fs.createWriteStream(tmp);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (onProgress && total > 0) onProgress(received / total);
          });
          res.pipe(out);
          out.on('finish', () => {
            try {
              fs.renameSync(tmp, dest);
              resolve();
            } catch (e) {
              fs.rmSync(tmp, { force: true });
              reject(e as Error);
            }
          });
          out.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error('Download timeout: ' + (label || url)));
        });
      };
      fetchUrl(url);
    });

    if (expectedSha1) {
      const actual = HttpClient.sha1File(dest);
      if (actual.toLowerCase() !== expectedSha1.toLowerCase()) {
        throw new Error(
          `SHA1 mismatch for ${label || dest}: expected ${expectedSha1}, got ${actual}`,
        );
      }
    }
  }
}
