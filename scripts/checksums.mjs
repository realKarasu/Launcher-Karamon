import { createHash } from 'crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const distDir   = join(__dirname, '..', 'dist');

const INCLUDE_EXTS = new Set(['.exe', '.yml', '.blockmap']);
const EXCLUDE      = new Set(['builder-debug.yml', 'builder-effective-config.yaml']);

function hash(file, algo) {
  return createHash(algo).update(readFileSync(file)).digest('hex');
}

function formatSize(bytes) {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(2) + ' MB';
  if (bytes >= 1024)      return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

const files = readdirSync(distDir)
  .filter(name => {
    if (EXCLUDE.has(name))          return false;
    if (!INCLUDE_EXTS.has(extname(name))) return false;
    const full = join(distDir, name);
    return statSync(full).isFile();
  })
  .sort();

if (files.length === 0) {
  console.log('Aucun artefact trouvé dans dist/');
  process.exit(0);
}

const lines = [
  `Karamon Launcher — Checksums`,
  `Générés le : ${new Date().toISOString()}`,
  '',
];

for (const name of files) {
  const full  = join(distDir, name);
  const size  = statSync(full).size;
  const sha256 = hash(full, 'sha256');
  const sha512 = hash(full, 'sha512');

  lines.push(`── ${name} (${formatSize(size)})`);
  lines.push(`   SHA256 : ${sha256}`);
  lines.push(`   SHA512 : ${sha512}`);
  lines.push('');
}

const out = join(distDir, 'checksums.txt');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`✓ checksums.txt généré (${files.length} fichier(s))`);
files.forEach(name => console.log(`  · ${name}`));
