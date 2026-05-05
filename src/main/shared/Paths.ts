import path from 'path';
import os from 'os';

export class Paths {
  readonly dataDir: string;
  readonly authCache: string;
  readonly configFile: string;
  readonly versionsDir: string;
  readonly librariesDir: string;
  readonly assetsDir: string;
  readonly cacheDir: string;
  readonly instancesDir: string;
  readonly logsDir: string;

  constructor(rootDir: string) {
    this.dataDir = rootDir;
    this.authCache = path.join(rootDir, 'auth.json');
    this.configFile = path.join(rootDir, 'config.json');
    this.versionsDir = path.join(rootDir, 'versions');
    this.librariesDir = path.join(rootDir, 'libraries');
    this.assetsDir = path.join(rootDir, 'assets');
    this.cacheDir = path.join(rootDir, 'cache');
    this.instancesDir = path.join(rootDir, 'instances');
    this.logsDir = path.join(rootDir, 'logs');
  }

  instanceDir(name: string): string {
    return path.join(this.instancesDir, name);
  }

  modsDir(name: string): string {
    return path.join(this.instancesDir, name, 'mods');
  }

  nativesDir(versionId: string): string {
    return path.join(this.versionsDir, versionId, 'natives');
  }

  static default(): Paths {
    return new Paths(path.join(Paths.appDataRoot(), '.karamon-launcher'));
  }

  static minecraftLauncherDir(): string {
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
    }
    if (process.platform === 'win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
    }
    return path.join(os.homedir(), '.minecraft');
  }

  private static appDataRoot(): string {
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support');
    }
    if (process.platform === 'win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming');
    }
    return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
}
