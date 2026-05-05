import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AppConfig } from '../../../ipc/contract';
import type {
  ModpackSync,
  StatusEmitter,
  ProgressEmitter,
} from '../modpack/ModpackSync';
import { ServersDat } from './ServersDat';

const DEFAULT_HOST = 'karamon.fr';
const DEFAULT_PROFILE_NAME = 'Karamon';
const DOWNLOADS_BASE_URL = 'https://karamon.fr/downloads/';

const WIN_EXE_CANDIDATES = [
  'C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe',
  'C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Minecraft', 'MinecraftLauncher.exe'),
];
const UWP_APP_ID = 'Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft';
const MAC_APP_CANDIDATES = ['/Applications/Minecraft.app', '/Applications/Minecraft Launcher.app'];

export interface MinecraftLauncherOptions {
  mcLauncherDir: string;
  modpackSync: ModpackSync;
  serversDatFactory: (dir: string) => ServersDat;
}

export class MinecraftLauncher {
  private readonly mcLauncherDir: string;
  private readonly modpackSync: ModpackSync;
  private readonly serversDatFactory: (dir: string) => ServersDat;

  constructor({ mcLauncherDir, modpackSync, serversDatFactory }: MinecraftLauncherOptions) {
    this.mcLauncherDir = mcLauncherDir;
    this.modpackSync = modpackSync;
    this.serversDatFactory = serversDatFactory;
  }

  instanceDir(config: AppConfig): string {
    return config.mcGameDir || this.mcLauncherDir;
  }

  async launch(config: AppConfig, onStatus: StatusEmitter, onProgress: ProgressEmitter): Promise<void> {
    const gameDir = this.instanceDir(config);
    this.prepareGameDir(gameDir, config, onStatus);

    onStatus('Synchronisation des mods...');
    await this.modpackSync.sync(DOWNLOADS_BASE_URL, gameDir, onStatus, (p) => onProgress(p * 0.9));

    onStatus('Lancement du launcher Minecraft...');
    onProgress(1);
    this.spawnLauncher(config.minecraftLauncherPath);
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

  private prepareGameDir(gameDir: string, config: AppConfig, onStatus: StatusEmitter): void {
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
    const host = config.server?.host || DEFAULT_HOST;
    try {
      this.serversDatFactory(gameDir).ensureServer(host, DEFAULT_PROFILE_NAME);
    } catch (e) {
      onStatus('Avertissement servers.dat: ' + (e as Error).message);
    }
  }

  private spawnLauncher(customPath: string): void {
    if (process.platform === 'darwin') {
      this.spawnLauncherMac(customPath);
      return;
    }
    this.spawnLauncherWin(customPath);
  }

  private spawnLauncherWin(customPath: string): void {
    const exe = MinecraftLauncher.findWinExe(customPath);
    if (exe) {
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    spawn('explorer.exe', [`shell:AppsFolder\\${UWP_APP_ID}`], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  private spawnLauncherMac(customPath: string): void {
    const target = MinecraftLauncher.findMacApp(customPath);
    if (target) {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    spawn('open', ['-a', 'Minecraft'], { detached: true, stdio: 'ignore' }).unref();
  }

  private static findWinExe(customPath: string): string | null {
    if (customPath && fs.existsSync(customPath)) return customPath;
    return WIN_EXE_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
  }

  private static findMacApp(customPath: string): string | null {
    if (customPath && fs.existsSync(customPath)) return customPath;
    return MAC_APP_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
  }
}
