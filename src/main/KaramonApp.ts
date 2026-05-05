import { app, ipcMain, dialog } from 'electron/main';
import { shell } from 'electron/common';
import path from 'path';
import fs from 'fs';
import {
  Channels,
  type AppConfigUpdate,
  type ExportLogsResult,
  type LaunchResult,
  type PingResult,
  type SetupResult,
} from '../ipc/contract';
import { Paths } from './shared/Paths';
import { HttpClient } from './shared/HttpClient';
import { Config } from './features/config/Config';
import { ServerPing } from './features/server/ServerPing';
import { ServersDat } from './features/minecraft/ServersDat';
import { OptionsWriter } from './features/minecraft/OptionsWriter';
import { FabricInstaller } from './features/minecraft/FabricInstaller';
import { LauncherProfile } from './features/minecraft/LauncherProfile';
import { ModpackSync } from './features/modpack/ModpackSync';
import {
  MinecraftLauncher,
  type ServerListSetupResult,
} from './features/minecraft/MinecraftLauncher';
import { AutoUpdater } from './features/updater/AutoUpdater';
import { WindowManager } from './WindowManager';

const MC_VERSION = '1.21.1';
const FABRIC_VERSION = '0.19.2';
const PROFILE_NAME = 'Karamon';
const SERVER_PING_TIMEOUT_MS = 5000;
const CLOSE_DELAY_MS = 2000;

export class KaramonApp {
  private readonly paths = Paths.default();
  private readonly config = new Config(this.paths.configFile).load();
  private readonly http = new HttpClient();
  private readonly serverPing = new ServerPing();
  private readonly fabric = new FabricInstaller({
    mcVersion: MC_VERSION,
    fabricVersion: FABRIC_VERSION,
    http: this.http,
  });
  private readonly profile = new LauncherProfile(Paths.minecraftLauncherDir());
  private readonly modpackSync = new ModpackSync({
    http: this.http,
    optionsWriterFactory: (dir) => new OptionsWriter(dir),
  });
  private readonly minecraft = new MinecraftLauncher({
    mcLauncherDir: Paths.minecraftLauncherDir(),
    modpackSync: this.modpackSync,
    serversDatFactory: (dir) => new ServersDat(dir),
  });

  private readonly window: WindowManager;
  private readonly updater = new AutoUpdater({
    onReady: (info) => this.window.send(Channels.eventUpdateReady, info),
  });

  constructor(distDir: string, assetsDir: string) {
    this.window = new WindowManager(distDir, assetsDir);
  }

  start(): void {
    app.whenReady().then(() => {
      this.registerIpc();
      this.window.create();
      this.updater.start();
      app.on('activate', () => {
        if (!this.window.exists()) this.window.create();
      });
    });
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }

  private statusEmitter() {
    return (msg: string): void => this.window.send(Channels.eventStatus, msg);
  }

  private progressEmitter() {
    return (val: number): void =>
      this.window.send(Channels.eventProgress, Math.max(0, Math.min(1, val)));
  }

  private registerIpc(): void {
    ipcMain.on(Channels.windowMinimize, () => this.window.minimize());
    ipcMain.on(Channels.windowMaximize, () => this.window.toggleMaximize());
    ipcMain.on(Channels.windowClose, () => this.window.close());
    ipcMain.on(Channels.updateInstall, () => this.updater.installNow());

    ipcMain.handle(Channels.configGet, () => this.config.get());
    ipcMain.handle(Channels.configSet, (_e, updates: AppConfigUpdate) => {
      this.config.set(updates);
      return this.config.get();
    });

    ipcMain.handle(Channels.minecraftSetup, () => this.setupMinecraft());
    ipcMain.handle(Channels.launchPlay, () => this.play());
    ipcMain.handle(Channels.launchSyncMods, () => this.syncMods());
    ipcMain.handle(Channels.serverPing, () => this.pingServer());
    ipcMain.handle(Channels.folderInstance, () => this.openInstance());
    ipcMain.handle(Channels.folderData, () => this.openDataDir());
    ipcMain.handle(Channels.logsExport, (_e, text: string) => this.exportLogs(text));
  }

  private async setupMinecraft(): Promise<SetupResult> {
    const cfg = this.config.get();
    const gameDir = this.minecraft.instanceDir(cfg);
    const launcherDir = Paths.minecraftLauncherDir();
    const host = cfg.server?.host || 'karamon.fr';
    const results: string[] = [];
    let ok = true;

    const serverResults = this.minecraft.ensureServerLists(gameDir, host, PROFILE_NAME);
    const serverErrors = serverResults.filter(
      (r): r is Extract<ServerListSetupResult, { ok: false }> => !r.ok,
    );
    if (serverErrors.length === 0) {
      results.push(`servers.dat OK (${serverResults.length} emplacement(s))`);
    } else {
      ok = false;
      results.push(
        'servers.dat ERREUR ' +
          serverErrors.map((r) => `${r.dir}: ${r.error}`).join('; '),
      );
    }

    try {
      await this.fabric.ensureVersion(launcherDir);
      results.push('Fabric OK');
    } catch (e) {
      ok = false;
      results.push('Fabric ERREUR ' + (e as Error).message);
    }

    try {
      this.profile.ensure({
        name: PROFILE_NAME,
        versionId: this.fabric.versionId,
        gameDir,
        memoryMb: cfg.memoryMb,
        jvmArgs: cfg.jvmArgs,
      });
      results.push('Profil OK');
    } catch (e) {
      ok = false;
      results.push('Profil ERREUR ' + (e as Error).message);
    }

    return {
      ok,
      details: results.join(' | '),
      path: gameDir,
    };
  }

  private async play(): Promise<LaunchResult> {
    const cfg = this.config.get();
    const onStatus = this.statusEmitter();
    const onProgress = this.progressEmitter();
    try {
      onProgress(0);
      await this.minecraft.launch(cfg, onStatus, onProgress);
      this.window.send(Channels.eventGameState, { running: true });
      onStatus('Launcher Minecraft ouvert !');
      if (cfg.closeLauncherOnGameStart) setTimeout(() => this.window.close(), CLOSE_DELAY_MS);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      onStatus('Erreur: ' + msg);
      onProgress(0);
      this.window.send(Channels.eventGameState, { running: false });
      return { ok: false, error: msg };
    }
  }

  private async syncMods(): Promise<LaunchResult> {
    const cfg = this.config.get();
    const onStatus = this.statusEmitter();
    const onProgress = this.progressEmitter();
    try {
      onProgress(0);
      await this.minecraft.syncOnly(cfg, onStatus, onProgress);
      onProgress(1);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      onStatus('Erreur de synchronisation: ' + msg);
      onProgress(0);
      return { ok: false, error: msg };
    }
  }

  private async pingServer(): Promise<PingResult> {
    const cfg = this.config.get();
    try {
      return await this.serverPing.ping(cfg.server.host, cfg.server.port, SERVER_PING_TIMEOUT_MS);
    } catch {
      return { online: false };
    }
  }

  private openInstance(): void {
    const dir = this.minecraft.instanceDir(this.config.get());
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  }

  private openDataDir(): void {
    fs.mkdirSync(this.paths.dataDir, { recursive: true });
    shell.openPath(this.paths.dataDir);
  }

  private async exportLogs(text: string): Promise<ExportLogsResult> {
    const win = this.window.current();
    const opts = {
      title: 'Exporter les logs',
      defaultPath: path.join(app.getPath('desktop'), `karamon-logs-${Date.now()}.txt`),
      filters: [{ name: 'Fichiers texte', extensions: ['txt'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, text, 'utf8');
      return { ok: true };
    }
    return { ok: false };
  }
}
