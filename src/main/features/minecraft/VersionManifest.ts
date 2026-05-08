import path from 'path';
import fs from 'fs';
import type { HttpClient } from '../../shared/HttpClient';

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

interface ManifestEntry {
  id: string;
  type: string;
  url: string;
  sha1: string;
}

interface Manifest {
  versions: ManifestEntry[];
}

export class VersionManifest {
  private cached: Manifest | null = null;

  constructor(private readonly http: HttpClient) {}

  async fetchVersionJson(versionId: string, dest: string): Promise<string> {
    if (fs.existsSync(dest)) {
      return fs.readFileSync(dest, 'utf8');
    }
    if (!this.cached) {
      this.cached = await this.http.getJson<Manifest>(MANIFEST_URL);
    }
    const entry = this.cached.versions.find((v) => v.id === versionId);
    if (!entry) throw new Error(`Version Minecraft introuvable dans le manifest : ${versionId}`);
    const text = await this.http.getText(entry.url);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text, 'utf8');
    return text;
  }
}
