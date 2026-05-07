import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import type { HttpClient } from '../../shared/HttpClient';
import { OptionsWriter } from '../minecraft/OptionsWriter';

const CACHE_FILE = '.karamon-sync-cache.json';
const MODS_ZIP_NAME = 'mods.zip';
const MODS_ZIP_TMP = '.karamon-mods.zip';
const RESOURCE_PACKS_MANIFEST = 'resourcepacks-manifest.json';
const RESOURCE_PACKS_PATH_PREFIX = 'resourcepacks/';
const SHADER_PACKS_MANIFEST = 'shaderpacks-manifest.json';
const SHADER_PACKS_PATH_PREFIX = 'shaderpacks/';
const PARALLEL_DOWNLOADS = 8;
const ZIP_DOWNLOAD_TIMEOUT_MS = 600000;

export type StatusEmitter = (msg: string) => void;
export type ProgressEmitter = (fraction: number) => void;

interface ManifestEntry {
  name: string;
  size: number;
}

interface OptionalManifest {
  present: boolean;
  key: string;
  entries: ManifestEntry[];
}

interface SyncDirs {
  mods: string;
  resourcepacks: string;
  shaderpacks: string;
}

interface CacheData {
  modsEtag?: string;
  jarNames?: string[];
  resourcePacksKey?: string;
  shaderPacksKey?: string;
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

  invalidateCache(gameDir: string): void {
    const cachePath = path.join(gameDir, CACHE_FILE);
    try {
      fs.rmSync(cachePath, { force: true });
    } catch {
      /* best-effort */
    }
  }

  static listMods(gameDir: string): { name: string; size: number }[] {
    const dir = path.join(gameDir, 'mods');
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.jar'))
        .map((name) => {
          let size = 0;
          try {
            size = fs.statSync(path.join(dir, name)).size;
          } catch {
            /* ignore */
          }
          return { name, size };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async sync(
    baseUrl: string,
    gameDir: string,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<void> {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const dirs = this.ensureDirs(gameDir);
    const zipUrl = base + MODS_ZIP_NAME;

    onStatus('Vérification du pack...');
    onProgress(0.02);

    const headers = await this.http.head(zipUrl);
    const etag = ModpackSync.extractEtag(headers);
    if (!etag) {
      throw new Error('mods.zip indisponible (ETag/Last-Modified manquant)');
    }

    const resourcePacks = await this.fetchOptionalManifest(base, RESOURCE_PACKS_MANIFEST);
    const shaderPacks = await this.fetchOptionalManifest(base, SHADER_PACKS_MANIFEST);
    const cache = this.readCache(gameDir);

    const modsUpToDate =
      cache.modsEtag === etag &&
      Array.isArray(cache.jarNames) &&
      cache.jarNames.length > 0 &&
      cache.jarNames.every((n) => fs.existsSync(path.join(dirs.mods, n)));
    const resourcePacksUpToDate = this.manifestGroupUpToDate(
      cache.resourcePacksKey,
      resourcePacks,
      dirs.resourcepacks,
    );
    const shaderPacksUpToDate = this.manifestGroupUpToDate(
      cache.shaderPacksKey,
      shaderPacks,
      dirs.shaderpacks,
    );

    if (modsUpToDate && resourcePacksUpToDate && shaderPacksUpToDate) {
      onStatus('Pack déjà à jour, aucun téléchargement nécessaire.');
      onProgress(1);
      return;
    }

    let jarNames: string[] = cache.jarNames ?? [];

    if (!modsUpToDate) {
      onStatus('Téléchargement de mods.zip...');
      const zipPath = path.join(gameDir, MODS_ZIP_TMP);
      try {
        await this.http.download(zipUrl, zipPath, {
          label: MODS_ZIP_NAME,
          timeoutMs: ZIP_DOWNLOAD_TIMEOUT_MS,
          onProgress: (p) => onProgress(0.05 + p * 0.55),
        });

        onStatus('Extraction des mods...');
        onProgress(0.62);
        jarNames = ModpackSync.extractJars(zipPath, dirs.mods);
      } finally {
        fs.rmSync(zipPath, { force: true });
      }
      this.cleanupExtras(dirs.mods, jarNames, '.jar', onStatus, 'Mod supprimé');
    }
    onProgress(0.68);

    if (resourcePacks.present) {
      await this.syncManifestGroup(
        resourcePacks,
        dirs.resourcepacks,
        base,
        RESOURCE_PACKS_PATH_PREFIX,
        'resource packs',
        'Resource pack supprimé',
        onStatus,
        onProgress,
        0.7,
        0.13,
      );
    } else {
      onProgress(0.83);
    }

    if (shaderPacks.present) {
      await this.syncManifestGroup(
        shaderPacks,
        dirs.shaderpacks,
        base,
        SHADER_PACKS_PATH_PREFIX,
        'shader packs',
        'Shader pack supprimé',
        onStatus,
        onProgress,
        0.84,
        0.13,
      );
    } else {
      onProgress(0.97);
    }

    const writer = this.optionsWriterFactory(gameDir);
    for (const rp of resourcePacks.entries) {
      try {
        writer.ensureResourcePack(rp.name);
      } catch {
        /* non-fatal */
      }
    }
    for (const sp of shaderPacks.entries) {
      try {
        writer.ensureShader(sp.name);
      } catch {
        /* non-fatal */
      }
    }

    this.writeCache(gameDir, {
      modsEtag: etag,
      jarNames,
      resourcePacksKey: resourcePacks.present ? resourcePacks.key : cache.resourcePacksKey,
      shaderPacksKey: shaderPacks.present ? shaderPacks.key : cache.shaderPacksKey,
      syncedAt: Date.now(),
    });
    onStatus(
      `Pack synchronisé: ${jarNames.length} mods, ` +
        `${resourcePacks.entries.length} resource packs, ${shaderPacks.entries.length} shaders.`,
    );
    onProgress(1);
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

  private static extractEtag(headers: Record<string, string | string[] | undefined>): string {
    const raw = headers['etag'] ?? headers['last-modified'];
    if (Array.isArray(raw)) return raw[0] ?? '';
    return typeof raw === 'string' ? raw : '';
  }

  private static extractJars(zipPath: string, modsDir: string): string[] {
    const zip = new AdmZip(zipPath);
    const seen = new Set<string>();
    const jarNames: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = path.basename(entry.entryName);
      if (!name.toLowerCase().endsWith('.jar')) continue;
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const target = ModpackSync.safeJoin(modsDir, name);
      fs.writeFileSync(target, entry.getData());
      jarNames.push(name);
    }
    if (jarNames.length === 0) {
      throw new Error('mods.zip ne contient aucun .jar');
    }
    return jarNames;
  }

  private async fetchOptionalManifest(baseUrl: string, manifestName: string): Promise<OptionalManifest> {
    try {
      const text = await this.http.getText(baseUrl + manifestName);
      return {
        present: true,
        key: ModpackSync.hashText(text),
        entries: ModpackSync.parseManifest(text, manifestName),
      };
    } catch {
      return { present: false, key: '', entries: [] };
    }
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

  private static hashText(text: string): string {
    return crypto.createHash('sha1').update(text).digest('hex');
  }

  private manifestGroupUpToDate(
    cachedKey: string | undefined,
    manifest: OptionalManifest,
    dir: string,
  ): boolean {
    if (!manifest.present) return true;
    return cachedKey === manifest.key && this.allEntriesPresent(dir, manifest.entries);
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

  private async syncManifestGroup(
    manifest: OptionalManifest,
    destDir: string,
    baseUrl: string,
    urlPrefix: string,
    statusLabel: string,
    cleanupLabel: string,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
    progressStart: number,
    progressSpan: number,
  ): Promise<void> {
    if (manifest.entries.length > 0) {
      onStatus(`Téléchargement de ${manifest.entries.length} ${statusLabel}...`);
      await this.downloadAll(
        manifest.entries,
        destDir,
        baseUrl,
        urlPrefix,
        onStatus,
        onProgress,
        progressStart,
        progressSpan,
      );
    } else {
      onProgress(progressStart + progressSpan);
    }

    this.cleanupExtras(
      destDir,
      manifest.entries.map((e) => e.name),
      '.zip',
      onStatus,
      cleanupLabel,
    );
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
    keptNames: string[],
    ext: string,
    onStatus: StatusEmitter,
    label: string,
  ): void {
    const keptLc = new Set(keptNames.map((n) => n.toLowerCase()));
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

  private writeCache(gameDir: string, data: CacheData): void {
    try {
      fs.writeFileSync(path.join(gameDir, CACHE_FILE), JSON.stringify(data), 'utf8');
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
