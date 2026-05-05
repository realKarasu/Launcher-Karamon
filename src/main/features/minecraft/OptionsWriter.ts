import fs from 'fs';
import path from 'path';

export class OptionsWriter {
  private readonly mcDir: string;

  constructor(mcDir: string) {
    this.mcDir = mcDir;
  }

  ensureResourcePack(packFileName: string): void {
    const file = path.join(this.mcDir, 'options.txt');
    const key = 'resourcePacks:';
    const entry = `file/${packFileName}`;

    if (!fs.existsSync(file)) {
      fs.mkdirSync(this.mcDir, { recursive: true });
      fs.writeFileSync(file, `${key}["vanilla","fabric","${entry}"]\n`, 'utf8');
      return;
    }

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const idx = lines.findIndex((l) => l.startsWith(key));

    if (idx === -1) {
      lines.push(`${key}["vanilla","fabric","${entry}"]`);
    } else {
      try {
        const arr = JSON.parse(lines[idx].slice(key.length)) as string[];
        if (!arr.includes(entry)) {
          arr.push(entry);
          lines[idx] = key + JSON.stringify(arr);
        }
      } catch {
        /* leave malformed line untouched */
      }
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  }

  ensureShader(shaderFileName: string): void {
    this.upsertLine(
      path.join(this.mcDir, 'config', 'iris.properties'),
      `shaderPack=${shaderFileName}`,
      /^shaderPack=/m,
      { createIfMissing: true },
    );

    const optifineFile = path.join(this.mcDir, 'optionsshaders.txt');
    if (fs.existsSync(optifineFile)) {
      this.upsertLine(optifineFile, `shaderPack=${shaderFileName}`, /^shaderPack=/m, {
        createIfMissing: false,
      });
    }
  }

  private upsertLine(
    filePath: string,
    line: string,
    regex: RegExp,
    { createIfMissing }: { createIfMissing: boolean },
  ): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
      if (createIfMissing) fs.writeFileSync(filePath, line + '\n', 'utf8');
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + line;
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }
}
