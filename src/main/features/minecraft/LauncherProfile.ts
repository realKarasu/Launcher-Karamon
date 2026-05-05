import fs from 'fs';
import path from 'path';

const DEFAULT_MEMORY_MB = 12288;
const PROFILE_FILE_VERSION = 3;
const BASE_JVM_FLAGS = '-Xms512m -XX:+UseG1GC -XX:MaxGCPauseMillis=50';

export interface ProfileSpec {
  name: string;
  versionId: string;
  gameDir: string;
  memoryMb: number;
  jvmArgs: string;
}

interface ProfileEntry {
  created?: string;
  icon?: string;
  name: string;
  type?: string;
  javaArgs?: string;
  lastVersionId?: string;
  lastUsed?: string;
  gameDir?: string;
}

interface ProfileFile {
  profiles: Record<string, ProfileEntry>;
  settings?: Record<string, unknown>;
  version?: number;
}

export class LauncherProfile {
  private readonly dir: string;
  private readonly file: string;

  constructor(mcLauncherDir: string) {
    this.dir = mcLauncherDir;
    this.file = path.join(mcLauncherDir, 'launcher_profiles.json');
  }

  ensure({ name, versionId, gameDir, memoryMb, jvmArgs }: ProfileSpec): void {
    const data = this.read();
    const javaArgs = LauncherProfile.buildJavaArgs(memoryMb, jvmArgs);
    const useCustomGameDir = path.resolve(gameDir) !== path.resolve(this.dir);
    const now = new Date().toISOString();

    const existingKey = Object.keys(data.profiles).find(
      (k) => k === name || data.profiles[k].name === name,
    );

    const profile: ProfileEntry = existingKey
      ? data.profiles[existingKey]
      : { created: now, icon: 'Grass', name, type: 'custom' };

    profile.javaArgs = javaArgs;
    profile.lastVersionId = versionId;
    profile.lastUsed = now;
    if (useCustomGameDir) profile.gameDir = gameDir;
    else delete profile.gameDir;

    data.profiles[existingKey ?? name] = profile;

    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  private read(): ProfileFile {
    const fallback: ProfileFile = { profiles: {}, settings: {}, version: PROFILE_FILE_VERSION };
    if (!fs.existsSync(this.file)) return fallback;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as ProfileFile;
      if (!data.profiles) data.profiles = {};
      return data;
    } catch {
      return fallback;
    }
  }

  private static buildJavaArgs(memoryMb: number, extra: string): string {
    const heap = `-Xmx${memoryMb || DEFAULT_MEMORY_MB}m`;
    const base = `${heap} ${BASE_JVM_FLAGS}`;
    return extra ? `${base} ${extra}` : base;
  }
}
