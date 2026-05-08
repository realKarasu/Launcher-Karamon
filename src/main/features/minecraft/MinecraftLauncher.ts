import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../../../ipc/contract';
import type {
  ModpackSync,
  StatusEmitter,
  ProgressEmitter,
} from '../modpack/ModpackSync';
import { ServersDat } from './ServersDat';
import type { GameLauncher } from './GameLauncher';

const DEFAULT_HOST = 'play.karamon.fr';
const DEFAULT_PROFILE_NAME = 'Karamon';
const DOWNLOADS_BASE_URL = 'https://karamon.fr/downloads/';

export interface MinecraftLauncherOptions {
  mcLauncherDir: string;
  modpackSync: ModpackSync;
  serversDatFactory: (dir: string) => ServersDat;
  gameLauncher: GameLauncher;
}

export interface LaunchEvents {
  onStatus: StatusEmitter;
  onProgress: ProgressEmitter;
  onLog: (line: string) => void;
  onExit: (code: number | null) => void;
}

export type ServerListSetupResult =
  | { ok: true; dir: string }
  | { ok: false; dir: string; error: string };

export class MinecraftLauncher {
  private readonly mcLauncherDir: string;
  private readonly modpackSync: ModpackSync;
  private readonly serversDatFactory: (dir: string) => ServersDat;
  private readonly gameLauncher: GameLauncher;

  constructor({ mcLauncherDir, modpackSync, serversDatFactory, gameLauncher }: MinecraftLauncherOptions) {
    this.mcLauncherDir = mcLauncherDir;
    this.modpackSync = modpackSync;
    this.serversDatFactory = serversDatFactory;
    this.gameLauncher = gameLauncher;
  }

  instanceDir(config: AppConfig): string {
    return config.mcGameDir || this.mcLauncherDir;
  }

  isRunning(): boolean {
    return this.gameLauncher.isRunning();
  }

  ensureServerLists(gameDir: string, host: string, name: string): ServerListSetupResult[] {
    return this.serverListDirs(gameDir).map((dir) => {
      try {
        this.serversDatFactory(dir).ensureServer(host, name);
        return { ok: true, dir };
      } catch (e) {
        return { ok: false, dir, error: (e as Error).message };
      }
    });
  }

  async launch(config: AppConfig, events: LaunchEvents): Promise<void> {
    const gameDir = this.instanceDir(config);
    this.prepareGameDir(gameDir, config, events.onStatus);

    events.onStatus('Synchronisation du pack...');
    await this.modpackSync.sync(DOWNLOADS_BASE_URL, gameDir, events.onStatus, (p) => events.onProgress(p * 0.3));

    await this.gameLauncher.launch(
      {
        javaPath: config.javaPath,
        memoryMb: config.memoryMb,
        jvmArgs: config.jvmArgs,
        gameDir,
      },
      {
        onStatus: events.onStatus,
        onProgress: (p) => events.onProgress(0.3 + p * 0.7),
        onLog: events.onLog,
        onExit: events.onExit,
      },
    );
  }

  async syncOnly(
    config: AppConfig,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<void> {
    const gameDir = this.instanceDir(config);
    this.prepareGameDir(gameDir, config, onStatus);
    await this.modpackSync.sync(DOWNLOADS_BASE_URL, gameDir, onStatus, onProgress);
  }

  async repair(
    config: AppConfig,
    onStatus: StatusEmitter,
    onProgress: ProgressEmitter,
  ): Promise<void> {
    const gameDir = this.instanceDir(config);
    this.prepareGameDir(gameDir, config, onStatus);
    onStatus('Réparation : invalidation du cache...');
    this.modpackSync.invalidateCache(gameDir);
    await this.modpackSync.sync(DOWNLOADS_BASE_URL, gameDir, onStatus, onProgress);
  }

  private prepareGameDir(gameDir: string, config: AppConfig, onStatus: StatusEmitter): void {
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
    const host = config.server?.host || DEFAULT_HOST;
    for (const result of this.ensureServerLists(gameDir, host, DEFAULT_PROFILE_NAME)) {
      if (!result.ok) {
        onStatus(`Avertissement servers.dat (${result.dir}): ${result.error}`);
      }
    }
  }

  private serverListDirs(gameDir: string): string[] {
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const dir of [gameDir, this.mcLauncherDir]) {
      const key = path.resolve(dir).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dirs.push(dir);
    }
    return dirs;
  }
}
