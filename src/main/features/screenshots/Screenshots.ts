import fs from 'fs';
import path from 'path';
import { protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import type { ScreenshotEntry, ScreenshotsListResult } from '../../../ipc/contract';

const SCHEME = 'karamon-shot';
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export class Screenshots {
  static registerProtocol(): void {
    protocol.handle(SCHEME, (req) => {
      const url = new URL(req.url);
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!path.isAbsolute(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!ALLOWED_EXT.has(path.extname(filePath).toLowerCase())) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  static registerPrivileged(): void {
    protocol.registerSchemesAsPrivileged([
      { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
    ]);
  }

  list(gameDir: string): ScreenshotsListResult {
    const dir = path.join(gameDir, 'screenshots');
    if (!fs.existsSync(dir)) return { dir, screenshots: [] };

    const entries: ScreenshotEntry[] = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        entries.push({
          name,
          url: `${SCHEME}:///${encodeURIComponent(full)}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        // skip unreadable
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    return { dir, screenshots: entries };
  }

  delete(gameDir: string, name: string): ScreenshotsListResult {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Nom invalide');
    }
    const dir = path.join(gameDir, 'screenshots');
    const full = path.join(dir, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return this.list(gameDir);
  }
}
