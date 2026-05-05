import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { HttpClient } from '../../shared/HttpClient';
import { OptionsWriter } from '../minecraft/OptionsWriter';

const CACHE_FILE = '.karamon-sync-cache.json';
const MODS_MANIFEST = 'manifest.json';
const RP_MANIFEST = 'resourcepacks-manifest.json';
const RP_PATH_PREFIX = 'resourcepacks/';
const PARALLEL_DOWNLOADS = 8;

export type StatusEmitter = (msg: string) => void;
export type ProgressEmitter = (fraction: number) => void;

interface ManifestEntry {
  name: string;
  size: number;
}

interface SyncDirs {
  mods: string;
  resourcepacks: string;
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
    baseUrl: string,
    gameDir: string,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<void> {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const dirs = this.ensureDirs(gameDir);

    onStatus('Vérification du pack...');
    onProgress(0.02);

    const modsManifestText = await this.http.getText(base + MODS_MANIFEST);
    const mods = ModpackSync.parseManifest(modsManifestText, MODS_MANIFEST);

    let rpsManifestText = '';
    let rps: ManifestEntry[] = [];
    try {
      rpsManifestText = await this.http.getText(base + RP_MANIFEST);
      rps = ModpackSync.parseManifest(rpsManifestText, RP_MANIFEST);
    } catch {
      /* resource pack manifest is optional */
    }

    const cacheKey = ModpackSync.hashManifests(modsManifestText, rpsManifestText);
    if (
      this.readCache(gameDir).key === cacheKey &&
      this.allEntriesPresent(dirs.mods, mods) &&
      this.allEntriesPresent(dirs.resourcepacks, rps)
    ) {
      onStatus('Pack déjà à jour, aucun téléchargement nécessaire.');
      onProgress(1);
      return;
    }

    onStatus(`Téléchargement de ${mods.length} mods...`);
    await this.downloadAll(mods, dirs.mods, base, '', onStatus, onProgress, 0.05, 0.7);

    if (rps.length > 0) {
      onStatus(`Téléchargement de ${rps.length} resource packs...`);
      await this.downloadAll(
        rps,
        dirs.resourcepacks,
        base,
        RP_PATH_PREFIX,
        onStatus,
        onProgress,
        0.75,
        0.2,
      );
    }

    onProgress(0.96);
    this.cleanupExtras(dirs.mods, mods, '.jar', onStatus, 'Mod supprimé');
    this.cleanupExtras(dirs.resourcepacks, rps, '.zip', onStatus, 'Resource pack supprimé');

    const writer = this.optionsWriterFactory(gameDir);
    for (const rp of rps) {
      try {
        writer.ensureResourcePack(rp.name);
      } catch {
        /* non-fatal */
      }
    }

    this.writeCache(gameDir, cacheKey);
    onStatus(`Pack synchronisé: ${mods.length} mods, ${rps.length} resource packs.`);
    onProgress(1);
  }

  private ensureDirs(gameDir: string): SyncDirs {
    const dirs: SyncDirs = {
      mods: path.join(gameDir, 'mods'),
      resourcepacks: path.join(gameDir, 'resourcepacks'),
    };
    for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
    return dirs;
  }

  private static parseManifest(text: string, label: string): ManifestEntry[] {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`Manifest ${label} illisible: ${(e as Error).message}`);
    }
    if (!Array.isArray(raw)) throw new Error(`Manifest ${label} invalide (attendu: tableau)`);
    return raw
      .filter((e): e is ManifestEntry =>
        !!e &&
        typeof (e as ManifestEntry).name === 'string' &&
        typeof (e as ManifestEntry).size === 'number',
      )
      .map((e) => ({ name: e.name, size: e.size }));
  }

  private static hashManifests(modsText: string, rpsText: string): string {
    return crypto.createHash('sha1').update(modsText).update('||').update(rpsText).digest('hex');
  }

  private allEntriesPresent(dir: string, entries: ManifestEntry[]): boolean {
    for (const entry of entries) {
      if (!ModpackSync.fileMatchesSize(path.join(dir, entry.name), entry.size)) return false;
    }
    return true;
  }

  private static fileMatchesSize(filePath: string, size: number): boolean {
    try {
      return fs.statSync(filePath).size === size;
    } catch {
      return false;
    }
  }

  private async downloadAll(
    entries: ManifestEntry[],
    destDir: string,
    baseUrl: string,
    urlPrefix: string,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
    progressStart: number,
    progressSpan: number,
  ): Promise<void> {
    if (entries.length === 0) return;

    const queue = [...entries];
    let done = 0;
    const failures: string[] = [];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) return;
        const target = ModpackSync.safeJoin(destDir, entry.name);
        if (!ModpackSync.fileMatchesSize(target, entry.size)) {
          const url = baseUrl + urlPrefix + encodeURIComponent(entry.name);
          try {
            await this.http.download(url, target, { label: entry.name });
            onStatus(`+ ${entry.name}`);
          } catch (e) {
            failures.push(entry.name);
            onStatus(`Échec ${entry.name}: ${(e as Error).message}`);
          }
        }
        done++;
        onProgress(progressStart + progressSpan * (done / entries.length));
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_DOWNLOADS, entries.length) }, () => worker()),
    );

    if (failures.length > 0) {
      throw new Error(`${failures.length} téléchargement(s) échoué(s): ${failures.join(', ')}`);
    }
  }

  private cleanupExtras(
    dir: string,
    kept: ManifestEntry[],
    ext: string,
    onStatus: StatusEmitter,
    label: string,
  ): void {
    const keptLc = new Set(kept.map((e) => e.name.toLowerCase()));
    for (const file of fs.readdirSync(dir)) {
      if (file.toLowerCase().endsWith(ext) && !keptLc.has(file.toLowerCase())) {
        fs.rmSync(path.join(dir, file), { force: true });
        onStatus(`${label}: ${file}`);
      }
    }
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
      throw new Error(`Nom de fichier refusé (path traversal): ${relPath}`);
    }
    return dest;
  }
}
