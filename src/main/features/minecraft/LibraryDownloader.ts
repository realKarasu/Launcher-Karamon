import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type { HttpClient } from '../../shared/HttpClient';
import { RuleEvaluator } from './RuleEvaluator';
import type { MojangLibrary, MojangArtifact } from './VersionResolver';

export interface DownloadProgress {
  (fraction: number, label: string): void;
}

export class LibraryDownloader {
  constructor(private readonly http: HttpClient) {}

  classpath(libraries: MojangLibrary[], librariesDir: string): string[] {
    const ctx = RuleEvaluator.currentContext();
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const lib of libraries) {
      if (!RuleEvaluator.evaluate(lib.rules, ctx)) continue;
      if (lib.natives) continue;
      const artifactPath = LibraryDownloader.artifactPath(lib);
      if (!artifactPath) continue;
      const abs = path.join(librariesDir, artifactPath);
      if (seen.has(abs)) continue;
      seen.add(abs);
      paths.push(abs);
    }
    return paths;
  }

  async downloadAll(
    libraries: MojangLibrary[],
    librariesDir: string,
    onProgress?: DownloadProgress,
  ): Promise<void> {
    const ctx = RuleEvaluator.currentContext();
    const tasks: Array<{ artifact: MojangArtifact; dest: string; label: string }> = [];

    for (const lib of libraries) {
      if (!RuleEvaluator.evaluate(lib.rules, ctx)) continue;
      const main = lib.downloads?.artifact;
      if (main?.path && main.url) {
        tasks.push({
          artifact: main,
          dest: path.join(librariesDir, main.path),
          label: lib.name,
        });
      } else if (lib.url && !lib.natives) {
        const derived = LibraryDownloader.deriveFromName(lib.name, lib.url);
        if (derived) {
          tasks.push({ artifact: derived.artifact, dest: path.join(librariesDir, derived.relPath), label: lib.name });
        }
      }
      const nativeKey = lib.natives?.[ctx.osName];
      if (nativeKey && lib.downloads?.classifiers?.[nativeKey]) {
        const classifier = lib.downloads.classifiers[nativeKey];
        if (classifier.path) {
          tasks.push({
            artifact: classifier,
            dest: path.join(librariesDir, classifier.path),
            label: `${lib.name} (natives)`,
          });
        }
      }
    }

    let done = 0;
    for (const task of tasks) {
      onProgress?.(done / tasks.length, task.label);
      await this.http.download(task.artifact.url, task.dest, {
        expectedSha1: task.artifact.sha1,
        label: task.label,
      });
      done++;
    }
    onProgress?.(1, 'Librairies prêtes');
  }

  async extractNatives(
    libraries: MojangLibrary[],
    librariesDir: string,
    nativesDir: string,
  ): Promise<void> {
    fs.mkdirSync(nativesDir, { recursive: true });
    const ctx = RuleEvaluator.currentContext();
    for (const lib of libraries) {
      if (!RuleEvaluator.evaluate(lib.rules, ctx)) continue;
      const nativeKey = lib.natives?.[ctx.osName];
      if (!nativeKey) continue;
      const classifier = lib.downloads?.classifiers?.[nativeKey];
      if (!classifier?.path) continue;
      const jarPath = path.join(librariesDir, classifier.path);
      if (!fs.existsSync(jarPath)) continue;
      const exclude = lib.extract?.exclude ?? ['META-INF/'];
      LibraryDownloader.extractJar(jarPath, nativesDir, exclude);
    }
  }

  private static extractJar(jarPath: string, dest: string, exclude: string[]): void {
    const zip = new AdmZip(jarPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (exclude.some((e) => name.startsWith(e))) continue;
      const out = path.join(dest, name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, entry.getData());
    }
  }

  private static artifactPath(lib: MojangLibrary): string | null {
    if (lib.downloads?.artifact?.path) return lib.downloads.artifact.path;
    return LibraryDownloader.relPathFromName(lib.name);
  }

  private static relPathFromName(name: string): string | null {
    const parts = name.split(':');
    if (parts.length < 3) return null;
    const [group, artifact, version, classifier] = parts;
    const groupPath = group.replace(/\./g, '/');
    const fileName = classifier
      ? `${artifact}-${version}-${classifier}.jar`
      : `${artifact}-${version}.jar`;
    return `${groupPath}/${artifact}/${version}/${fileName}`;
  }

  private static deriveFromName(
    name: string,
    baseUrl: string,
  ): { artifact: MojangArtifact; relPath: string } | null {
    const relPath = LibraryDownloader.relPathFromName(name);
    if (!relPath) return null;
    const url = baseUrl.endsWith('/') ? baseUrl + relPath : `${baseUrl}/${relPath}`;
    return { artifact: { url, sha1: '', size: 0, path: relPath }, relPath };
  }
}
