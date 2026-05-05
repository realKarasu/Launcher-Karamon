import fs from 'fs';
import path from 'path';
import type { HttpClient } from '../../shared/HttpClient';

interface FabricMeta {
  id?: string;
}

export interface FabricInstallerOptions {
  mcVersion: string;
  fabricVersion: string;
  http: HttpClient;
}

export class FabricInstaller {
  readonly mcVersion: string;
  readonly fabricVersion: string;
  readonly versionId: string;
  readonly metaUrl: string;
  private readonly http: HttpClient;

  constructor({ mcVersion, fabricVersion, http }: FabricInstallerOptions) {
    this.mcVersion = mcVersion;
    this.fabricVersion = fabricVersion;
    this.http = http;
    this.versionId = `fabric-loader-${fabricVersion}-${mcVersion}`;
    this.metaUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${fabricVersion}/profile/json`;
  }

  async ensureVersion(mcLauncherDir: string): Promise<void> {
    const versionDir = path.join(mcLauncherDir, 'versions', this.versionId);
    const versionJson = path.join(versionDir, `${this.versionId}.json`);
    if (fs.existsSync(versionJson)) return;

    const text = await this.http.getText(this.metaUrl);
    const parsed = JSON.parse(text) as FabricMeta;
    if (!parsed.id || !parsed.id.includes('fabric')) {
      throw new Error('Réponse Fabric meta invalide');
    }

    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(versionJson, text, 'utf8');
  }
}
