import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type { HttpClient } from '../../shared/HttpClient';
import { OptionsWriter } from '../minecraft/OptionsWriter';

const CACHE_FILE = '.karamon-sync-cache.json';

export type StatusEmitter = (msg: string) => void;
export type ProgressEmitter = (fraction: number) => void;

interface SyncDirs {
  mods: string;
  resourcepacks: string;
  shaderpacks: string;
}

interface ExtractSummary {
  mods: Set<string>;
  resourcepacks: Map<string, string>;
  shaderpacks: Map<string, string>;
}

interface CacheData {
  key?: string;
  syncedAt?: number;
}

export interface ModpackSyncOptions {
  http: HttpClient;
  optionsWriterFactory: (dir: string) => OptionsWriter;
}

export class ModpackSync {
  private readonly http: HttpClient;
  private readonly optionsWriterFactory: (dir: string) => OptionsWriter;

  constructor({ http, optionsWriterFactory }: ModpackSyncOptions) {
    this.http = http;
    this.optionsWriterFactory = optionsWriterFactory;
  }

  async sync(
    packUrl: string,
    gameDir: string,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<void> {
    const normalizedPackUrl = ModpackSync.normalizePackUrl(packUrl);
    const dirs = this.ensureDirs(gameDir);

    onStatus('Vérification du pack...');
    onProgress(0.05);

    if (await this.isUpToDate(normalizedPackUrl, gameDir, dirs.mods)) {
      onStatus('Mods déjà à jour, aucun téléchargement nécessaire.');
      onProgress(1);
      return;
    }

    const serverKey = await this.fetchServerKey(normalizedPackUrl);
    const zipPath = path.join(gameDir, 'karamon-pack.zip');

    onStatus('Téléchargement du pack de mods...');
    await this.http.download(normalizedPackUrl, zipPath, {
      label: 'karamon-pack.zip',
      onProgress: (p) => onProgress(0.05 + p * 0.7),
    });

    onStatus('Extraction du pack...');
    onProgress(0.75);

    const summary = this.extract(zipPath, dirs, onStatus);

    this.cleanupRemovedFiles(dirs.mods, summary.mods, '.jar', onStatus, 'Mod supprimé');
    this.cleanupRemovedDirs(dirs.resourcepacks, summary.resourcepacks, onStatus, 'Resource pack supprimé');
    this.cleanupRemovedDirs(dirs.shaderpacks, summary.shaderpacks, onStatus, 'Shader pack supprimé');

    const writer = this.optionsWriterFactory(gameDir);
    for (const name of summary.resourcepacks.values()) {
      try {
        writer.ensureResourcePack(name);
      } catch {
        /* non-fatal */
      }
    }
    for (const name of summary.shaderpacks.values()) {
      try {
        writer.ensureShader(name);
      } catch {
        /* non-fatal */
      }
    }

    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore cleanup error */
    }
    if (serverKey) this.writeCache(gameDir, serverKey);

    onStatus(
      `Pack synchronisé: ${summary.mods.size} mods, ` +
        `${summary.resourcepacks.size} resource packs, ${summary.shaderpacks.size} shaders.`,
    );
    onProgress(1);
  }

  private static normalizePackUrl(packUrl: string): string {
    const normalized = packUrl.trim();
    if (!normalized) throw new Error('URL du modpack non configuree.');
    try {
      const url = new URL(normalized);
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.toString();
    } catch {
      return normalized;
    }
  }

  private ensureDirs(gameDir: string): SyncDirs {
    const dirs: SyncDirs = {
      mods: path.join(gameDir, 'mods'),
      resourcepacks: path.join(gameDir, 'resourcepacks'),
      shaderpacks: path.join(gameDir, 'shaderpacks'),
    };
    for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
    return dirs;
  }

  private async fetchServerKey(packUrl: string): Promise<string | null> {
    try {
      const headers = await this.http.head(packUrl);
      const etag = headers['etag'];
      const lastMod = headers['last-modified'];
      const len = headers['content-length'];
      return (
        (typeof etag === 'string' && etag) ||
        (typeof lastMod === 'string' && lastMod) ||
        (typeof len === 'string' && len) ||
        null
      );
    } catch {
      return null;
    }
  }

  private async isUpToDate(packUrl: string, gameDir: string, modsDir: string): Promise<boolean> {
    const modCount = fs.existsSync(modsDir)
      ? fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar')).length
      : 0;
    if (modCount === 0) return false;

    const key = await this.fetchServerKey(packUrl);
    if (!key) return false;
    return this.readCache(gameDir).key === key;
  }

  private readCache(gameDir: string): CacheData {
    try {
      return JSON.parse(fs.readFileSync(path.join(gameDir, CACHE_FILE), 'utf8')) as CacheData;
    } catch {
      return {};
    }
  }

  private writeCache(gameDir: string, key: string): void {
    try {
      fs.writeFileSync(
        path.join(gameDir, CACHE_FILE),
        JSON.stringify({ key, syncedAt: Date.now() }),
        'utf8',
      );
    } catch {
      /* best-effort cache */
    }
  }

  private static safeJoin(rootDir: string, relPath: string): string {
    const root = path.resolve(rootDir);
    const dest = path.resolve(root, relPath);
    if (dest !== root && !dest.startsWith(root + path.sep)) {
      throw new Error(`Entrée ZIP refusée (path traversal): ${relPath}`);
    }
    return dest;
  }

  private extract(zipPath: string, dirs: SyncDirs, onStatus: StatusEmitter): ExtractSummary {
    const zip = new AdmZip(zipPath);
    const summary: ExtractSummary = {
      mods: new Set(),
      resourcepacks: new Map(),
      shaderpacks: new Map(),
    };

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName.replace(/\\/g, '/');
      const folder = entryName.split('/')[0].toLowerCase();
      const baseName = path.basename(entryName);

      if (folder === 'resourcepacks') {
        this.writeNestedEntry(
          entry,
          entryName,
          'resourcepacks/',
          dirs.resourcepacks,
          summary.resourcepacks,
          'Resource pack',
          onStatus,
        );
      } else if (folder === 'shaderpacks' || folder === 'shaders') {
        this.writeNestedEntry(
          entry,
          entryName,
          folder + '/',
          dirs.shaderpacks,
          summary.shaderpacks,
          'Shader pack',
          onStatus,
        );
      } else if (baseName.endsWith('.jar')) {
        try {
          ModpackSync.safeJoin(dirs.mods, baseName);
        } catch (e) {
          onStatus((e as Error).message);
          continue;
        }
        fs.writeFileSync(path.join(dirs.mods, baseName), entry.getData());
        summary.mods.add(baseName.toLowerCase());
        onStatus(`Mod: ${baseName}`);
      }
    }
    return summary;
  }

  private writeNestedEntry(
    entry: AdmZip.IZipEntry,
    entryName: string,
    prefix: string,
    destRoot: string,
    registry: Map<string, string>,
    label: string,
    onStatus: StatusEmitter,
  ): void {
    const relPath = entryName.substring(prefix.length);
    if (!relPath) return;

    const topLevel = relPath.split('/')[0];
    const lcKey = topLevel.toLowerCase();
    if (!registry.has(lcKey)) {
      registry.set(lcKey, topLevel);
      onStatus(`${label}: ${topLevel}`);
    }

    let dest: string;
    try {
      dest = ModpackSync.safeJoin(destRoot, relPath);
    } catch (e) {
      onStatus((e as Error).message);
      return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
  }

  private cleanupRemovedFiles(
    dir: string,
    kept: Set<string>,
    ext: string,
    onStatus: StatusEmitter,
    label: string,
  ): void {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(ext) && !kept.has(file.toLowerCase())) {
        fs.unlinkSync(path.join(dir, file));
        onStatus(`${label}: ${file}`);
      }
    }
  }

  private cleanupRemovedDirs(
    dir: string,
    kept: Map<string, string>,
    onStatus: StatusEmitter,
    label: string,
  ): void {
    for (const item of fs.readdirSync(dir)) {
      if (!kept.has(item.toLowerCase())) {
        fs.rmSync(path.join(dir, item), { recursive: true, force: true });
        onStatus(`${label}: ${item}`);
      }
    }
  }
}
