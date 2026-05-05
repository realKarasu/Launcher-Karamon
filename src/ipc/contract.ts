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

export type PingResult =
  | { online: true; players: number; maxPlayers: number; motd: string; version: string }
  | { online: false };

export type ExportLogsResult = { ok: boolean };

export interface GameState {
  running: boolean;
}

export interface UpdateInfo {
  version: string;
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

  serverPing: 'server:ping',

  folderInstance: 'folder:instance',
  folderData: 'folder:data',

  logsExport: 'logs:export',

  updateInstall: 'update:install',

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
  [Channels.serverPing]: { req: void; res: PingResult };
  [Channels.folderInstance]: { req: void; res: void };
  [Channels.folderData]: { req: void; res: void };
  [Channels.logsExport]: { req: string; res: ExportLogsResult };
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

  pingServer(): Promise<PingResult>;

  openInstance(): Promise<void>;
  openData(): Promise<void>;

  exportLogs(text: string): Promise<ExportLogsResult>;

  installUpdate(): void;

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
