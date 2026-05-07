import fs from 'fs';
import path from 'path';
import type { CrashReport, CrashReportsListResult } from '../../../ipc/contract';

const CAUSE_PATTERNS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /java\.lang\.OutOfMemoryError/i, tag: 'Mémoire insuffisante (OOM)' },
  { regex: /java\.lang\.NoSuchMethodError/i, tag: 'Mod incompatible (NoSuchMethod)' },
  { regex: /java\.lang\.NoClassDefFoundError/i, tag: 'Mod manquant (NoClassDefFound)' },
  { regex: /Mixin (.+) failed/i, tag: 'Mixin échoué' },
  { regex: /Mod \S+ requires/i, tag: 'Dépendance de mod manquante' },
  { regex: /UnsatisfiedLinkError/i, tag: 'Native lib manquante' },
  { regex: /OpenGL/i, tag: 'Erreur GPU/OpenGL' },
  { regex: /Pixel format not accelerated/i, tag: 'Driver GPU' },
];

export class CrashReports {
  list(gameDir: string): CrashReportsListResult {
    const dir = path.join(gameDir, 'crash-reports');
    if (!fs.existsSync(dir)) return { dir, reports: [] };

    const reports: CrashReport[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.txt')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        const content = fs.readFileSync(full, 'utf8');
        reports.push({
          name,
          mtime: stat.mtimeMs,
          size: stat.size,
          summary: CrashReports.summarize(content),
          excerpt: CrashReports.excerpt(content),
        });
      } catch {
        // skip
      }
    }
    reports.sort((a, b) => b.mtime - a.mtime);
    return { dir, reports };
  }

  read(gameDir: string, name: string): string {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Nom invalide');
    }
    const full = path.join(gameDir, 'crash-reports', name);
    return fs.readFileSync(full, 'utf8');
  }

  delete(gameDir: string, name: string): CrashReportsListResult {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Nom invalide');
    }
    const full = path.join(gameDir, 'crash-reports', name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return this.list(gameDir);
  }

  private static summarize(content: string): string {
    for (const { regex, tag } of CAUSE_PATTERNS) {
      if (regex.test(content)) return tag;
    }
    const desc = content.match(/Description:\s*(.+)/);
    if (desc) return desc[1].trim().slice(0, 80);
    return 'Crash inconnu';
  }

  private static excerpt(content: string): string {
    const lines = content.split('\n');
    const start = lines.findIndex((l) => /Description:/.test(l));
    if (start === -1) return lines.slice(0, 30).join('\n');
    return lines.slice(start, start + 40).join('\n');
  }
}
