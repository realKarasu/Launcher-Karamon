import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import type { HttpClient } from '../../shared/HttpClient';
import type { Paths } from '../../shared/Paths';
import { JavaDetector } from './JavaDetector';

const execFileP = promisify(execFile);

const REQUIRED_MAJOR = 21;
const RUNTIME_DIR_NAME = 'jre-21';
const ADOPTIUM_DOWNLOAD_TIMEOUT_MS = 600000;

interface AdoptiumPackage {
  link: string;
  name: string;
  checksum?: string;
}

interface AdoptiumBinary {
  package: AdoptiumPackage;
}

interface AdoptiumAsset {
  binary: AdoptiumBinary;
  version: { semver?: string; openjdk_version?: string };
}

export type StatusEmitter = (msg: string) => void;
export type ProgressEmitter = (fraction: number) => void;

export class JavaProvisioner {
  constructor(
    private readonly paths: Paths,
    private readonly http: HttpClient,
    private readonly detector: JavaDetector,
  ) {}

  async ensure(
    configuredPath: string | undefined,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<string> {
    if (configuredPath) {
      const major = await this.probeMajor(configuredPath);
      if (major !== null && major >= REQUIRED_MAJOR) return configuredPath;
    }

    const managed = this.managedJavaPath();
    if (managed) {
      const major = await this.probeMajor(managed);
      if (major !== null && major >= REQUIRED_MAJOR) return managed;
    }

    const detected = (await this.detector.detect()).find(
      (c) => JavaProvisioner.parseMajor(c.version) >= REQUIRED_MAJOR,
    );
    if (detected) return detected.path;

    if (process.platform !== 'win32') {
      throw new Error(
        `Java ${REQUIRED_MAJOR} requis et non détecté. Installe-le depuis adoptium.net puis relance le launcher.`,
      );
    }

    return await this.installAdoptium(onStatus, onProgress);
  }

  private async installAdoptium(onStatus: StatusEmitter, onProgress: ProgressEmitter): Promise<string> {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const apiUrl =
      `https://api.adoptium.net/v3/assets/latest/${REQUIRED_MAJOR}/hotspot` +
      `?architecture=${arch}&image_type=jre&os=windows&vendor=eclipse`;

    onStatus('Recherche de Java 21 (Adoptium Temurin)...');
    const assets = await this.http.getJson<AdoptiumAsset[]>(apiUrl);
    const asset = JavaProvisioner.pickZipAsset(assets);
    if (!asset) {
      throw new Error('Aucune archive Java 21 disponible chez Adoptium pour cette architecture.');
    }

    const versionLabel = asset.version.semver ?? asset.version.openjdk_version ?? 'inconnu';
    onStatus(`Téléchargement de Java 21 (${versionLabel}, ~45 Mo)...`);

    const cacheDir = this.paths.cacheDir;
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmpZip = path.join(cacheDir, asset.binary.package.name);

    await this.http.download(asset.binary.package.link, tmpZip, {
      label: 'Java 21',
      timeoutMs: ADOPTIUM_DOWNLOAD_TIMEOUT_MS,
      onProgress,
    });

    onStatus('Extraction de Java 21...');
    this.extractRuntime(tmpZip);
    fs.rmSync(tmpZip, { force: true });

    const javaPath = this.managedJavaPath();
    if (!javaPath) {
      throw new Error('Extraction terminée mais java.exe introuvable dans le runtime.');
    }
    const major = await this.probeMajor(javaPath);
    if (major === null || major < REQUIRED_MAJOR) {
      throw new Error(`Le runtime extrait n'est pas Java ${REQUIRED_MAJOR} (détecté: ${major ?? '?'}).`);
    }
    onStatus(`Java ${REQUIRED_MAJOR} prêt.`);
    return javaPath;
  }

  private extractRuntime(zipPath: string): void {
    const root = this.runtimeRoot();
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    fs.mkdirSync(root, { recursive: true });
    new AdmZip(zipPath).extractAllTo(root, true);
  }

  private runtimeRoot(): string {
    return path.join(this.paths.dataDir, 'runtime', RUNTIME_DIR_NAME);
  }

  private managedJavaPath(): string | null {
    const root = this.runtimeRoot();
    if (!fs.existsSync(root)) return null;
    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      return null;
    }
    for (const entry of entries) {
      const candidates = [
        path.join(root, entry, 'bin', exe),
        path.join(root, entry, 'Contents', 'Home', 'bin', exe),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
    return null;
  }

  private async probeMajor(javaPath: string): Promise<number | null> {
    try {
      const { stderr, stdout } = await execFileP(javaPath, ['-version'], { timeout: 4000 });
      const text = stderr || stdout || '';
      const m = text.match(/version "([^"]+)"/);
      if (!m) return null;
      return JavaProvisioner.parseMajor(m[1]);
    } catch {
      return null;
    }
  }

  private static pickZipAsset(assets: AdoptiumAsset[] | null | undefined): AdoptiumAsset | null {
    if (!Array.isArray(assets) || assets.length === 0) return null;
    return (
      assets.find((a) => a.binary.package.name?.toLowerCase().endsWith('.zip')) ??
      assets[0]
    );
  }

  static parseMajor(version: string): number {
    if (!version) return 0;
    const m = version.match(/^(\d+)/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    if (n === 1) {
      const second = version.match(/^1\.(\d+)/);
      return second ? parseInt(second[1], 10) : 0;
    }
    return n;
  }
}
