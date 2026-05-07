import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type { BackupEntry, BackupListResult } from '../../../ipc/contract';

const TARGETS = ['saves', 'config'];
const MAX_KEPT = 10;

export class Backup {
  private readonly backupDir: string;

  constructor(dataDir: string) {
    this.backupDir = path.join(dataDir, 'backups');
  }

  create(gameDir: string): BackupEntry {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(this.backupDir, `karamon-${stamp}.zip`);

    const zip = new AdmZip();
    let added = 0;
    for (const target of TARGETS) {
      const full = path.join(gameDir, target);
      if (!fs.existsSync(full)) continue;
      zip.addLocalFolder(full, target);
      added++;
    }
    if (added === 0) throw new Error('Aucun dossier à sauvegarder (saves/, config/)');
    zip.writeZip(filePath);

    this.prune();
    const stat = fs.statSync(filePath);
    return { name: path.basename(filePath), path: filePath, size: stat.size, mtime: stat.mtimeMs };
  }

  list(): BackupListResult {
    if (!fs.existsSync(this.backupDir)) return { dir: this.backupDir, backups: [] };
    const backups: BackupEntry[] = [];
    for (const name of fs.readdirSync(this.backupDir)) {
      if (!name.endsWith('.zip')) continue;
      const full = path.join(this.backupDir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        backups.push({ name, path: full, size: stat.size, mtime: stat.mtimeMs });
      } catch {
        // skip
      }
    }
    backups.sort((a, b) => b.mtime - a.mtime);
    return { dir: this.backupDir, backups };
  }

  delete(name: string): BackupListResult {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Nom invalide');
    }
    const full = path.join(this.backupDir, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return this.list();
  }

  private prune(): void {
    const all = this.list().backups;
    const excess = all.slice(MAX_KEPT);
    for (const b of excess) {
      try {
        fs.unlinkSync(b.path);
      } catch {
        // ignore
      }
    }
  }
}
