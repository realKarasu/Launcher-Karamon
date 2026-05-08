import path from 'path';
import { Paths } from '../../shared/Paths';
import type { HttpClient } from '../../shared/HttpClient';
import { VersionManifest } from './VersionManifest';
import type { Rule } from './RuleEvaluator';

export interface MojangArtifact {
  path?: string;
  url: string;
  sha1: string;
  size: number;
}

export interface MojangLibrary {
  name: string;
  url?: string;
  rules?: Rule[];
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
  downloads?: {
    artifact?: MojangArtifact;
    classifiers?: Record<string, MojangArtifact>;
  };
}

export interface MojangArgument {
  rules?: Rule[];
  value: string | string[];
}

export type RawArgument = string | MojangArgument;

export interface MojangAssetIndex {
  id: string;
  url: string;
  sha1: string;
  size: number;
  totalSize?: number;
}

export interface MojangVersion {
  id: string;
  jar?: string;
  type?: string;
  inheritsFrom?: string;
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: { game?: RawArgument[]; jvm?: RawArgument[] };
  libraries?: MojangLibrary[];
  assetIndex?: MojangAssetIndex;
  assets?: string;
  downloads?: { client?: MojangArtifact };
  javaVersion?: { component: string; majorVersion: number };
}

export class VersionResolver {
  private readonly manifest: VersionManifest;

  constructor(http: HttpClient, private readonly paths: Paths) {
    this.manifest = new VersionManifest(http);
  }

  async resolveFromText(rootJsonText: string): Promise<MojangVersion> {
    const chain: MojangVersion[] = [];
    let currentText: string | null = rootJsonText;

    while (currentText) {
      const json = JSON.parse(currentText) as MojangVersion;
      chain.push(json);
      if (!json.inheritsFrom) break;
      const parentDest = path.join(
        this.paths.versionsDir,
        json.inheritsFrom,
        `${json.inheritsFrom}.json`,
      );
      currentText = await this.manifest.fetchVersionJson(json.inheritsFrom, parentDest);
    }

    return this.merge(chain.reverse());
  }

  private merge(chain: MojangVersion[]): MojangVersion {
    const root = chain[0];
    const merged: MojangVersion = { id: '' };

    for (const v of chain) {
      if (v.id) merged.id = v.id;
      if (v.type) merged.type = v.type;
      if (v.mainClass) merged.mainClass = v.mainClass;
      if (v.minecraftArguments) merged.minecraftArguments = v.minecraftArguments;
      if (v.assetIndex) merged.assetIndex = v.assetIndex;
      if (v.assets) merged.assets = v.assets;
      if (v.downloads) merged.downloads = v.downloads;
      if (v.javaVersion) merged.javaVersion = v.javaVersion;
      if (v.jar) merged.jar = v.jar;
    }

    if (!merged.jar) merged.jar = root.id;

    merged.libraries = chain.flatMap((v) => v.libraries ?? []);
    merged.arguments = {
      game: chain.flatMap((v) => v.arguments?.game ?? []),
      jvm: chain.flatMap((v) => v.arguments?.jvm ?? []),
    };

    return merged;
  }
}
