import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { JavaCandidate } from '../../../ipc/contract';

const execFileP = promisify(execFile);

const WIN_ROOTS = [
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files\\Zulu',
  'C:\\Program Files\\Amazon Corretto',
  'C:\\Program Files (x86)\\Java',
];

const POSIX_ROOTS = [
  '/usr/lib/jvm',
  '/usr/java',
  '/Library/Java/JavaVirtualMachines',
  '/opt/java',
  '/opt/homebrew/opt',
];

export class JavaDetector {
  async detect(): Promise<JavaCandidate[]> {
    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    const found = new Map<string, JavaCandidate>();

    const roots = process.platform === 'win32' ? WIN_ROOTS : POSIX_ROOTS;
    for (const root of roots) {
      for (const javaPath of this.scan(root, exe)) {
        if (found.has(javaPath)) continue;
        const info = await this.probe(javaPath);
        if (info) found.set(javaPath, info);
      }
    }

    const sysJava = await this.probeSystem(exe);
    if (sysJava && !found.has(sysJava.path)) {
      found.set(sysJava.path, sysJava);
    }

    if (process.env.JAVA_HOME) {
      const candidate = path.join(process.env.JAVA_HOME, 'bin', exe);
      if (!found.has(candidate)) {
        const info = await this.probe(candidate);
        if (info) found.set(candidate, info);
      }
    }

    return [...found.values()].sort((a, b) => b.version.localeCompare(a.version));
  }

  private *scan(root: string, exe: string): Generator<string> {
    if (!fs.existsSync(root)) return;
    let dirs: string[];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      return;
    }
    for (const d of dirs) {
      const candidates = [
        path.join(root, d, 'bin', exe),
        path.join(root, d, 'Contents', 'Home', 'bin', exe),
        path.join(root, d, 'jre', 'bin', exe),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) yield c;
      }
    }
  }

  private async probe(javaPath: string): Promise<JavaCandidate | null> {
    try {
      const { stderr, stdout } = await execFileP(javaPath, ['-version'], { timeout: 4000 });
      const text = (stderr || stdout || '').trim();
      const version = JavaDetector.parseVersion(text);
      const vendor = JavaDetector.parseVendor(text);
      return { path: javaPath, version, vendor };
    } catch {
      return null;
    }
  }

  private async probeSystem(exe: string): Promise<JavaCandidate | null> {
    try {
      const { stderr, stdout } = await execFileP(exe, ['-version'], { timeout: 4000 });
      const text = (stderr || stdout || '').trim();
      return {
        path: exe,
        version: JavaDetector.parseVersion(text),
        vendor: JavaDetector.parseVendor(text) || 'system',
      };
    } catch {
      return null;
    }
  }

  private static parseVersion(text: string): string {
    const m = text.match(/version "([^"]+)"/);
    return m ? m[1] : '?';
  }

  private static parseVendor(text: string): string {
    if (/Temurin|Adoptium/i.test(text)) return 'Temurin';
    if (/Zulu/i.test(text)) return 'Azul Zulu';
    if (/Corretto/i.test(text)) return 'Corretto';
    if (/OpenJDK/i.test(text)) return 'OpenJDK';
    if (/HotSpot/i.test(text)) return 'Oracle';
    if (/GraalVM/i.test(text)) return 'GraalVM';
    return os.userInfo().username ? '' : '';
  }
}
