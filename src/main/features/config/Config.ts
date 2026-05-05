import fs from 'fs';
import path from 'path';
import type { AppConfig, AppConfigUpdate } from '../../../ipc/contract';

const DEFAULT_MODPACK_URL =
  'https://github.com/realKarasu/Launcher-Karamon/releases/download/mods/karamon-pack.zip';

const DEFAULTS: AppConfig = {
  modpackUrl: DEFAULT_MODPACK_URL,
  mcGameDir: '',
  minecraftLauncherPath: '',
  memoryMb: 2048,
  javaPath: '',
  jvmArgs: '',
  closeLauncherOnGameStart: false,
  server: { host: 'karamon.fr', port: 25565 },
};

export class Config {
  private data: AppConfig = { ...DEFAULTS, server: { ...DEFAULTS.server } };

  constructor(private readonly filePath: string) {}

  load(): this {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      this.data = {
        ...DEFAULTS,
        ...parsed,
        server: { ...DEFAULTS.server, ...(parsed.server ?? {}) },
      };
      this.data = Config.normalize(this.data);
    } catch {
      // file missing or unreadable — keep defaults
    }
    return this;
  }

  get(): AppConfig {
    return { ...this.data, server: { ...this.data.server } };
  }

  set(updates: AppConfigUpdate): void {
    this.data = {
      ...this.data,
      ...updates,
      server: { ...this.data.server, ...(updates.server ?? {}) },
    };
    this.data = Config.normalize(this.data);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private static normalize(data: AppConfig): AppConfig {
    const next: AppConfig = { ...data, server: { ...data.server } };
    const host = typeof next.server.host === 'string' ? next.server.host.trim() : '';
    const port = Number(next.server.port);
    next.modpackUrl = Config.normalizeModpackUrl(next.modpackUrl);
    next.server.host = host || DEFAULTS.server.host;
    next.server.port = Number.isFinite(port) && port > 0 ? port : DEFAULTS.server.port;
    return next;
  }

  private static normalizeModpackUrl(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return DEFAULT_MODPACK_URL;
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.toString();
    } catch {
      return raw;
    }
  }
}
