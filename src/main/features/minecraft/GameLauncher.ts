import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron/main';
import { Paths } from '../../shared/Paths';
import type { HttpClient } from '../../shared/HttpClient';
import type { AuthSession } from '../auth/AuthSession';
import { VersionResolver, type MojangVersion } from './VersionResolver';
import { LibraryDownloader } from './LibraryDownloader';
import { AssetDownloader } from './AssetDownloader';
import { ArgumentResolver } from './ArgumentResolver';

export interface GameLauncherOptions {
  paths: Paths;
  http: HttpClient;
  auth: AuthSession;
  mcVersion: string;
  fabricVersion: string;
}

export interface LaunchSpec {
  javaPath: string;
  memoryMb: number;
  jvmArgs: string;
  gameDir: string;
}

export interface LaunchEvents {
  onStatus: (msg: string) => void;
  onProgress: (fraction: number) => void;
  onExit: (code: number | null) => void;
  onLog: (line: string) => void;
}

const DEFAULT_MEMORY_MB = 4096;

export class GameLauncher {
  private readonly resolver: VersionResolver;
  private readonly libraries: LibraryDownloader;
  private readonly assets: AssetDownloader;
  private current: ChildProcess | null = null;

  constructor(private readonly opts: GameLauncherOptions) {
    this.resolver = new VersionResolver(opts.http, opts.paths);
    this.libraries = new LibraryDownloader(opts.http);
    this.assets = new AssetDownloader(opts.http);
  }

  isRunning(): boolean {
    return this.current !== null && this.current.exitCode === null;
  }

  async launch(spec: LaunchSpec, events: LaunchEvents): Promise<void> {
    if (this.isRunning()) throw new Error('Le jeu tourne déjà');

    events.onStatus('Authentification...');
    const session = await this.opts.auth.getActive();

    events.onStatus('Préparation de la version...');
    const version = await this.installVersion(events);

    events.onStatus('Construction de la commande...');
    const args = this.buildArgs(version, spec, session);

    events.onProgress(1);
    events.onStatus('Lancement de Minecraft...');

    const javaPath = spec.javaPath || 'java';
    const child = spawn(javaPath, args, {
      cwd: spec.gameDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.current = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) events.onLog(line);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) events.onLog(line);
      }
    });
    child.on('exit', (code) => {
      this.current = null;
      events.onExit(code);
    });
    child.on('error', (err) => {
      this.current = null;
      events.onLog(`Erreur Java: ${err.message}`);
      events.onExit(-1);
    });
  }

  private async installVersion(events: LaunchEvents): Promise<MojangVersion> {
    const fabricId = `fabric-loader-${this.opts.fabricVersion}-${this.opts.mcVersion}`;
    const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${this.opts.mcVersion}/${this.opts.fabricVersion}/profile/json`;
    const fabricJsonPath = path.join(this.opts.paths.versionsDir, fabricId, `${fabricId}.json`);

    let fabricText: string;
    if (fs.existsSync(fabricJsonPath)) {
      fabricText = fs.readFileSync(fabricJsonPath, 'utf8');
    } else {
      events.onStatus('Téléchargement du profil Fabric...');
      fabricText = await this.opts.http.getText(fabricUrl);
      fs.mkdirSync(path.dirname(fabricJsonPath), { recursive: true });
      fs.writeFileSync(fabricJsonPath, fabricText, 'utf8');
    }

    const version = await this.resolver.resolveFromText(fabricText);

    const clientJarPath = path.join(
      this.opts.paths.versionsDir,
      version.jar ?? version.id,
      `${version.jar ?? version.id}.jar`,
    );
    if (!fs.existsSync(clientJarPath) && version.downloads?.client) {
      events.onStatus('Téléchargement du client Minecraft...');
      events.onProgress(0.05);
      await this.opts.http.download(version.downloads.client.url, clientJarPath, {
        expectedSha1: version.downloads.client.sha1,
        label: 'client.jar',
      });
    }

    events.onStatus('Téléchargement des librairies...');
    await this.libraries.downloadAll(version.libraries ?? [], this.opts.paths.librariesDir, (frac, label) => {
      events.onProgress(0.1 + frac * 0.3);
      events.onStatus(`Librairies — ${label}`);
    });

    events.onStatus('Extraction des natives...');
    const nativesDir = this.opts.paths.nativesDir(version.id);
    await this.libraries.extractNatives(version.libraries ?? [], this.opts.paths.librariesDir, nativesDir);
    events.onProgress(0.45);

    if (version.assetIndex) {
      events.onStatus('Téléchargement des assets...');
      await this.assets.download(version.assetIndex, this.opts.paths.assetsDir, (frac, label) => {
        events.onProgress(0.45 + frac * 0.5);
        events.onStatus(label);
      });
    }

    return version;
  }

  private buildArgs(version: MojangVersion, spec: LaunchSpec, session: { profile: { id: string; name: string }; accessToken: string }): string[] {
    const cpEntries = this.libraries.classpath(version.libraries ?? [], this.opts.paths.librariesDir);
    const clientJarPath = path.join(
      this.opts.paths.versionsDir,
      version.jar ?? version.id,
      `${version.jar ?? version.id}.jar`,
    );
    cpEntries.push(clientJarPath);
    const classpath = cpEntries.join(path.delimiter);

    const memMb = spec.memoryMb || DEFAULT_MEMORY_MB;
    const heapArgs = [`-Xmx${memMb}m`, '-Xms512m'];
    const userJvm = (spec.jvmArgs || '').split(/\s+/).filter(Boolean);

    const vars = {
      authPlayerName: session.profile.name,
      authUuid: GameLauncher.formatUuid(session.profile.id),
      authAccessToken: session.accessToken,
      authXuid: '',
      clientId: '',
      userType: 'msa',
      versionName: version.id,
      versionType: version.type ?? 'release',
      gameDir: spec.gameDir,
      assetsRoot: this.opts.paths.assetsDir,
      assetsIndexName: version.assets ?? version.assetIndex?.id ?? 'legacy',
      classpath,
      nativesDir: this.opts.paths.nativesDir(version.id),
      launcherName: 'KaramonLauncher',
      launcherVersion: app.getVersion(),
    };

    const { jvm, game } = ArgumentResolver.resolve(version, vars);
    if (!version.mainClass) throw new Error('Version sans mainClass — JSON corrompu');

    return [...heapArgs, ...userJvm, ...jvm, version.mainClass, ...game];
  }

  private static formatUuid(raw: string): string {
    if (raw.includes('-')) return raw;
    if (raw.length !== 32) return raw;
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }
}
