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
    return new Paths(path.join(os.homedir(), 'AppData', 'Roaming', '.karamon-launcher'));
  }

  static minecraftLauncherDir(): string {
    return path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
  }
}
