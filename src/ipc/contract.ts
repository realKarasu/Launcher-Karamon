export interface ServerInfo {
  host: string;
  port: number;
}

export interface AppConfig {
  mcGameDir: string;
  minecraftLauncherPath: string;
  memoryMb: number;
  javaPath: string;
  jvmArgs: string;
  closeLauncherOnGameStart: boolean;
  server: ServerInfo;
  theme: 'red' | 'gold';
}

export type AppConfigUpdate = Partial<Omit<AppConfig, 'server'>> & {
  server?: Partial<ServerInfo>;
};

export interface SetupResult {
  ok: boolean;
  details: string;
  path: string;
}

export type LaunchResult = { ok: true } | { ok: false; error: string };

export interface SamplePlayer {
  name: string;
  id?: string;
}

export type PingResult =
  | {
      online: true;
      players: number;
      maxPlayers: number;
      motd: string;
      version: string;
      sample?: SamplePlayer[];
    }
  | { online: false };

export type ExportLogsResult = { ok: boolean };

export interface GameState {
  running: boolean;
}

export interface UpdateInfo {
  version: string;
}

export type UpdateCheckResult =
  | { status: 'no-update'; currentVersion: string }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; error: string }
  | { status: 'unsupported' };

export interface ModEntry {
  name: string;
  size: number;
}

export interface ModsListResult {
  dir: string;
  mods: ModEntry[];
}

export interface SystemInfo {
  totalMemMb: number;
  freeMemMb: number;
  cpuCount: number;
  platform: string;
  arch: string;
  appVersion: string;
}

export interface JavaCandidate {
  path: string;
  version: string;
  vendor: string;
}

export interface PlayStats {
  totalPlayMs: number;
  sessions: number;
  lastPlayedAt: number | null;
  firstPlayedAt: number | null;
}

export interface ScreenshotEntry {
  name: string;
  url: string;
  size: number;
  mtime: number;
}

export interface ScreenshotsListResult {
  dir: string;
  screenshots: ScreenshotEntry[];
}

export interface CrashReport {
  name: string;
  mtime: number;
  size: number;
  summary: string;
  excerpt: string;
}

export interface CrashReportsListResult {
  dir: string;
  reports: CrashReport[];
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export interface BackupListResult {
  dir: string;
  backups: BackupEntry[];
}

export const Channels = {
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',

  configGet: 'config:get',
  configSet: 'config:set',

  minecraftSetup: 'minecraft:setup',
  launchPlay: 'launch:play',
  launchSyncMods: 'launch:sync-mods',
  launchRepair: 'launch:repair',

  serverPing: 'server:ping',

  folderInstance: 'folder:instance',
  folderData: 'folder:data',

  logsExport: 'logs:export',

  updateInstall: 'update:install',
  updateCheck: 'update:check',

  modsList: 'mods:list',
  systemInfo: 'system:info',
  javaList: 'java:list',
  statsGet: 'stats:get',
  statsReset: 'stats:reset',
  screenshotsList: 'screenshots:list',
  screenshotsDelete: 'screenshots:delete',
  shellOpenExternal: 'shell:open-external',
  crashesList: 'crashes:list',
  crashesRead: 'crashes:read',
  crashesDelete: 'crashes:delete',
  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupDelete: 'backup:delete',

  eventStatus: 'status:update',
  eventProgress: 'progress:update',
  eventGameState: 'game:state',
  eventUpdateReady: 'update:ready',
} as const;

export type ChannelName = (typeof Channels)[keyof typeof Channels];

export interface IpcInvokeContract {
  [Channels.configGet]: { req: void; res: AppConfig };
  [Channels.configSet]: { req: AppConfigUpdate; res: AppConfig };
  [Channels.minecraftSetup]: { req: void; res: SetupResult };
  [Channels.launchPlay]: { req: void; res: LaunchResult };
  [Channels.launchSyncMods]: { req: void; res: LaunchResult };
  [Channels.launchRepair]: { req: void; res: LaunchResult };
  [Channels.serverPing]: { req: void; res: PingResult };
  [Channels.folderInstance]: { req: void; res: void };
  [Channels.folderData]: { req: void; res: void };
  [Channels.logsExport]: { req: string; res: ExportLogsResult };
  [Channels.updateCheck]: { req: void; res: UpdateCheckResult };
  [Channels.modsList]: { req: void; res: ModsListResult };
  [Channels.systemInfo]: { req: void; res: SystemInfo };
  [Channels.javaList]: { req: void; res: JavaCandidate[] };
  [Channels.statsGet]: { req: void; res: PlayStats };
  [Channels.statsReset]: { req: void; res: PlayStats };
  [Channels.screenshotsList]: { req: void; res: ScreenshotsListResult };
  [Channels.screenshotsDelete]: { req: string; res: ScreenshotsListResult };
  [Channels.shellOpenExternal]: { req: string; res: void };
  [Channels.crashesList]: { req: void; res: CrashReportsListResult };
  [Channels.crashesRead]: { req: string; res: string };
  [Channels.crashesDelete]: { req: string; res: CrashReportsListResult };
  [Channels.backupCreate]: { req: void; res: BackupEntry };
  [Channels.backupList]: { req: void; res: BackupListResult };
  [Channels.backupDelete]: { req: string; res: BackupListResult };
}

export interface IpcSendContract {
  [Channels.windowMinimize]: void;
  [Channels.windowMaximize]: void;
  [Channels.windowClose]: void;
  [Channels.updateInstall]: void;
}

export interface IpcEventContract {
  [Channels.eventStatus]: string;
  [Channels.eventProgress]: number;
  [Channels.eventGameState]: GameState;
  [Channels.eventUpdateReady]: UpdateInfo;
}

export interface LauncherApi {
  minimize(): void;
  maximize(): void;
  close(): void;

  getConfig(): Promise<AppConfig>;
  saveConfig(updates: AppConfigUpdate): Promise<AppConfig>;

  setupMinecraft(): Promise<SetupResult>;

  play(): Promise<LaunchResult>;
  syncMods(): Promise<LaunchResult>;
  repair(): Promise<LaunchResult>;

  pingServer(): Promise<PingResult>;

  openInstance(): Promise<void>;
  openData(): Promise<void>;

  exportLogs(text: string): Promise<ExportLogsResult>;

  installUpdate(): void;
  checkForUpdate(): Promise<UpdateCheckResult>;

  listMods(): Promise<ModsListResult>;
  systemInfo(): Promise<SystemInfo>;
  listJava(): Promise<JavaCandidate[]>;
  getStats(): Promise<PlayStats>;
  resetStats(): Promise<PlayStats>;
  listScreenshots(): Promise<ScreenshotsListResult>;
  deleteScreenshot(name: string): Promise<ScreenshotsListResult>;
  openExternal(url: string): Promise<void>;
  listCrashes(): Promise<CrashReportsListResult>;
  readCrash(name: string): Promise<string>;
  deleteCrash(name: string): Promise<CrashReportsListResult>;
  createBackup(): Promise<BackupEntry>;
  listBackups(): Promise<BackupListResult>;
  deleteBackup(name: string): Promise<BackupListResult>;

  onStatus(cb: (msg: string) => void): void;
  onProgress(cb: (val: number) => void): void;
  onGameState(cb: (state: GameState) => void): void;
  onUpdateReady(cb: (info: UpdateInfo) => void): void;
}

declare global {
  interface Window {
    launcher: LauncherApi;
  }
}
