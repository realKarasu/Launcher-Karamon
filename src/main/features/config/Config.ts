import fs from 'fs';
import path from 'path';
import type { AppConfig, AppConfigUpdate } from '../../../ipc/contract';

const DEFAULTS: AppConfig = Object.freeze({
  mcGameDir: '',
  minecraftLauncherPath: '',
  memoryMb: 12288,
  javaPath: '',
  jvmArgs: '',
  closeLauncherOnGameStart: false,
  server: { host: 'karamon.fr', port: 25565 },
}) as AppConfig;

export class Config {
  private readonly filePath: string;
  private data: AppConfig | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  load(): this {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as AppConfigUpdate;
        this.data = Config.merge(DEFAULTS, raw);
        return this;
      }
    } catch {
      /* fall through to defaults */
    }
    this.data = Config.clone(DEFAULTS);
    return this;
  }

  save(): void {
    if (!this.data) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  get(): AppConfig {
    if (!this.data) this.load();
    return Config.clone(this.data!);
  }

  set(updates: AppConfigUpdate): void {
    if (!this.data) this.load();
    this.data = Config.merge(this.data!, updates);
    this.save();
  }

  private static merge(base: AppConfig, updates: AppConfigUpdate): AppConfig {
    return {
      ...base,
      ...updates,
      server: { ...base.server, ...(updates.server ?? {}) },
    };
  }

  private static clone<T>(o: T): T {
    return JSON.parse(JSON.stringify(o)) as T;
  }
}
