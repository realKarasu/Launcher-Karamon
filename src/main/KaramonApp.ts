import { app, ipcMain, dialog } from 'electron/main';
import { shell } from 'electron/common';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  Channels,
  type AppConfigUpdate,
  type AuthLoginResult,
  type AuthSessionResult,
  type ExportLogsResult,
  type JavaCandidate,
  type LaunchResult,
  type ModsListResult,
  type PingResult,
  type SetupResult,
  type SystemInfo,
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
import { JavaDetector } from './features/java/JavaDetector';
import { PlayStats } from './features/stats/PlayStats';
import { Screenshots } from './features/screenshots/Screenshots';
import { DiscordRpc } from './features/discord/DiscordRpc';
import { CrashReports } from './features/crashes/CrashReports';
import { Backup } from './features/backup/Backup';
import { AuthSession } from './features/auth/AuthSession';
import { TokenStore } from './features/auth/TokenStore';
import { GameLauncher } from './features/minecraft/GameLauncher';
import { WindowManager } from './WindowManager';

const MC_VERSION = '1.21.1';
const FABRIC_VERSION = '0.19.2';
const PROFILE_NAME = 'Karamon';
const PUBLIC_SERVER_HOST = 'karamon.fr';
const STATUS_FALLBACK_HOST = 'play.karamon.fr';
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
  private readonly auth = new AuthSession(new TokenStore(this.paths.authCache));
  private readonly gameLauncher = new GameLauncher({
    paths: this.paths,
    http: this.http,
    auth: this.auth,
    mcVersion: MC_VERSION,
    fabricVersion: FABRIC_VERSION,
  });
  private readonly minecraft = new MinecraftLauncher({
    mcLauncherDir: Paths.minecraftLauncherDir(),
    modpackSync: this.modpackSync,
    serversDatFactory: (dir) => new ServersDat(dir),
    gameLauncher: this.gameLauncher,
  });

  private readonly window: WindowManager;
  private readonly updater = new AutoUpdater({
    onReady: (info) => this.window.send(Channels.eventUpdateReady, info),
  });
  private readonly javaDetector = new JavaDetector();
  private readonly stats = new PlayStats(this.paths.dataDir);
  private readonly screenshots = new Screenshots();
  private readonly crashes = new CrashReports();
  private readonly backup = new Backup(this.paths.dataDir);
  private readonly discord: DiscordRpc;
  private javaCache: JavaCandidate[] | null = null;

  constructor(distDir: string, assetsDir: string) {
    this.window = new WindowManager(distDir, assetsDir);
    const cfg = this.config.get();
    this.discord = new DiscordRpc({
      serverHost: cfg.server?.host || 'play.karamon.fr',
      serverPort: cfg.server?.port || 25565,
      pinger: this.serverPing,
      log: (msg) => this.window.send(Channels.eventStatus, msg),
    });
  }

  start(): void {
    app.whenReady().then(() => {
      Screenshots.registerProtocol();
      this.registerIpc();
      this.window.create();
      this.updater.start();
      this.discord.start();
      app.on('activate', () => {
        if (!this.window.exists()) this.window.create();
      });
    });
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('before-quit', () => {
      this.stats.endSession();
      void this.discord.destroy();
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
    ipcMain.handle(Channels.updateCheck, () => this.updater.check());

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

    ipcMain.handle(Channels.launchRepair, () => this.repair());
    ipcMain.handle(Channels.modsList, () => this.listMods());
    ipcMain.handle(Channels.systemInfo, () => this.getSystemInfo());
    ipcMain.handle(Channels.javaList, () => this.getJavaList());
    ipcMain.handle(Channels.statsGet, () => this.stats.read());
    ipcMain.handle(Channels.statsReset, () => this.stats.reset());
    ipcMain.handle(Channels.screenshotsList, () =>
      this.screenshots.list(this.minecraft.instanceDir(this.config.get())),
    );
    ipcMain.handle(Channels.screenshotsDelete, (_e, name: string) =>
      this.screenshots.delete(this.minecraft.instanceDir(this.config.get()), name),
    );
    ipcMain.handle(Channels.shellOpenExternal, (_e, url: string) => this.openExternal(url));
    ipcMain.handle(Channels.crashesList, () =>
      this.crashes.list(this.minecraft.instanceDir(this.config.get())),
    );
    ipcMain.handle(Channels.crashesRead, (_e, name: string) =>
      this.crashes.read(this.minecraft.instanceDir(this.config.get()), name),
    );
    ipcMain.handle(Channels.crashesDelete, (_e, name: string) =>
      this.crashes.delete(this.minecraft.instanceDir(this.config.get()), name),
    );
    ipcMain.handle(Channels.backupCreate, () =>
      this.backup.create(this.minecraft.instanceDir(this.config.get())),
    );
    ipcMain.handle(Channels.backupList, () => this.backup.list());
    ipcMain.handle(Channels.backupDelete, (_e, name: string) => this.backup.delete(name));

    ipcMain.handle(Channels.authLogin, () => this.authLogin());
    ipcMain.handle(Channels.authLogout, () => this.auth.logout());
    ipcMain.handle(Channels.authGetSession, () => this.authGetSession());
  }

  private async authLogin(): Promise<AuthLoginResult> {
    try {
      const profile = await this.auth.login();
      return { ok: true, profile };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private authGetSession(): AuthSessionResult {
    const profile = this.auth.cachedProfile();
    return profile ? { signedIn: true, profile } : { signedIn: false };
  }

  private async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) return;
    await shell.openExternal(url);
  }

  private listMods(): ModsListResult {
    const dir = path.join(this.minecraft.instanceDir(this.config.get()), 'mods');
    return { dir, mods: ModpackSync.listMods(this.minecraft.instanceDir(this.config.get())) };
  }

  private getSystemInfo(): SystemInfo {
    return {
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      cpuCount: os.cpus().length,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion(),
    };
  }

  private async getJavaList(): Promise<JavaCandidate[]> {
    if (!this.javaCache) {
      this.javaCache = await this.javaDetector.detect();
    }
    return this.javaCache;
  }

  private async repair(): Promise<LaunchResult> {
    const cfg = this.config.get();
    const onStatus = this.statusEmitter();
    const onProgress = this.progressEmitter();
    try {
      onProgress(0);
      onStatus('Réparation du pack...');
      await this.minecraft.repair(cfg, onStatus, onProgress);
      onProgress(1);
      onStatus('Pack réparé.');
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      onStatus('Erreur de réparation: ' + msg);
      onProgress(0);
      return { ok: false, error: msg };
    }
  }

  private async setupMinecraft(): Promise<SetupResult> {
    const cfg = this.config.get();
    const gameDir = this.minecraft.instanceDir(cfg);
    const launcherDir = Paths.minecraftLauncherDir();
    const host = cfg.server?.host || 'play.karamon.fr';
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
      await this.minecraft.launch(cfg, {
        onStatus,
        onProgress,
        onLog: (line) => this.window.send(Channels.eventStatus, line),
        onExit: (code) => {
          this.stats.endSession();
          this.discord.setMenu();
          this.window.send(Channels.eventGameState, { running: false });
          this.window.send(
            Channels.eventStatus,
            code === 0 ? 'Minecraft fermé.' : `Minecraft fermé (code ${code}).`,
          );
        },
      });
      this.stats.startSession();
      this.discord.setPlaying();
      this.window.send(Channels.eventGameState, { running: true });
      onStatus('Minecraft lancé !');
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
    const host = cfg.server.host || PUBLIC_SERVER_HOST;
    const port = cfg.server.port;
    const candidates = this.statusPingHosts(host);

    return await new Promise<PingResult>((resolve) => {
      let settled = false;
      let remaining = candidates.length;

      const finish = (result: PingResult): void => {
        if (settled) return;
        if (result.online || --remaining === 0) {
          settled = true;
          resolve(result.online ? result : { online: false });
        }
      };

      for (const candidate of candidates) {
        this.serverPing
          .ping(candidate, port, SERVER_PING_TIMEOUT_MS)
          .then(finish)
          .catch(() => finish({ online: false }));
      }
    });
  }

  private statusPingHosts(host: string): string[] {
    const normalized = host.trim().toLowerCase();
    const hosts = [normalized];
    if (normalized === PUBLIC_SERVER_HOST) hosts.unshift(STATUS_FALLBACK_HOST);
    return [...new Set(hosts)];
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
