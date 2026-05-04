const fs   = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const dl   = require('./downloader');
const { ensureResourcePack, ensureShader } = require('./minecraftSetup');

const CACHE_FILE = '.karamon-sync-cache.json';

function readCache(mcGameDir) {
  try { return JSON.parse(fs.readFileSync(path.join(mcGameDir, CACHE_FILE), 'utf8')); }
  catch (_) { return {}; }
}

function writeCache(mcGameDir, key) {
  try {
    fs.writeFileSync(
      path.join(mcGameDir, CACHE_FILE),
      JSON.stringify({ key, syncedAt: Date.now() }),
      'utf8'
    );
  } catch (_) {}
}

async function isUpToDate(packUrl, mcGameDir) {
  const modsDir = path.join(mcGameDir, 'mods');
  const modCount = fs.existsSync(modsDir)
    ? fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length
    : 0;
  if (modCount === 0) return false;

  try {
    const headers = await dl.head(packUrl);
    // ETag is the most reliable; fall back to Last-Modified, then Content-Length
    const serverKey = headers['etag'] || headers['last-modified'] || headers['content-length'];
    if (!serverKey) return false;
    return readCache(mcGameDir).key === serverKey;
  } catch (_) {
    return false;
  }
}

/**
 * Downloads and extracts the Karamon pack ZIP into the Minecraft game directory.
 * Handles mods (.jar), resourcepacks, and shaderpacks.
 * Skips the download entirely if the server-side pack hasn't changed (ETag check).
 */
async function syncMods(packUrl, mcGameDir, onStatus, onProgress) {
  if (!packUrl.startsWith('https://')) {
    throw new Error('Le modpack URL doit utiliser HTTPS.');
  }

  const modsDir          = path.join(mcGameDir, 'mods');
  const resourcepacksDir = path.join(mcGameDir, 'resourcepacks');
  const shaderpacksDir   = path.join(mcGameDir, 'shaderpacks');

  fs.mkdirSync(modsDir,          { recursive: true });
  fs.mkdirSync(resourcepacksDir, { recursive: true });
  fs.mkdirSync(shaderpacksDir,   { recursive: true });

  onStatus('Vérification du pack...');
  onProgress(0.05);

  if (await isUpToDate(packUrl, mcGameDir)) {
    onStatus('Mods déjà à jour, aucun téléchargement nécessaire.');
    onProgress(1);
    return;
  }

  // Fetch server key before download (to cache it after success)
  let serverKey = null;
  try {
    const headers = await dl.head(packUrl);
    serverKey = headers['etag'] || headers['last-modified'] || headers['content-length'] || null;
  } catch (_) {}

  const zipPath = path.join(mcGameDir, 'karamon-pack.zip');

  onStatus('Téléchargement du pack de mods...');
  await dl.download(packUrl, zipPath, '', (p) => onProgress(0.05 + p * 0.7), 'karamon-pack.zip');

  onStatus('Extraction du pack...');
  onProgress(0.75);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(e => !e.isDirectory);

  const incomingMods          = new Set();
  const incomingResourcePacks = new Map(); // lowercase -> original name
  const incomingShaderPacks   = new Map(); // lowercase -> original name

  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, '/');
    const baseName  = path.basename(entryName);
    const folder    = entryName.split('/')[0].toLowerCase();

    if (folder === 'resourcepacks') {
      const relPath = entryName.substring('resourcepacks/'.length);
      if (!relPath) continue;
      const topLevel = relPath.split('/')[0];
      if (!incomingResourcePacks.has(topLevel.toLowerCase())) {
        incomingResourcePacks.set(topLevel.toLowerCase(), topLevel);
        onStatus(`Resource pack: ${topLevel}`);
      }
      const destPath = path.join(resourcepacksDir, relPath);
      if (!path.resolve(destPath).startsWith(path.resolve(resourcepacksDir) + path.sep)) continue;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, entry.getData());

    } else if (folder === 'shaderpacks' || folder === 'shaders') {
      const relPath = entryName.substring((folder + '/').length);
      if (!relPath) continue;
      const topLevel = relPath.split('/')[0];
      if (!incomingShaderPacks.has(topLevel.toLowerCase())) {
        incomingShaderPacks.set(topLevel.toLowerCase(), topLevel);
        onStatus(`Shader pack: ${topLevel}`);
      }
      const destPath = path.join(shaderpacksDir, relPath);
      if (!path.resolve(destPath).startsWith(path.resolve(shaderpacksDir) + path.sep)) continue;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, entry.getData());

    } else if (baseName.endsWith('.jar')) {
      incomingMods.add(baseName.toLowerCase());
      zip.extractEntryTo(entry, modsDir, false, true);
      onStatus(`Mod: ${baseName}`);
    }
  }

  // Remove mods no longer in the pack
  for (const file of fs.readdirSync(modsDir)) {
    if (file.endsWith('.jar') && !incomingMods.has(file.toLowerCase())) {
      fs.unlinkSync(path.join(modsDir, file));
      onStatus(`Mod supprimé: ${file}`);
    }
  }

  // Remove resource packs no longer in the pack
  for (const item of fs.readdirSync(resourcepacksDir)) {
    if (!incomingResourcePacks.has(item.toLowerCase())) {
      fs.rmSync(path.join(resourcepacksDir, item), { recursive: true, force: true });
      onStatus(`Resource pack supprimé: ${item}`);
    }
  }

  // Remove shader packs no longer in the pack
  for (const item of fs.readdirSync(shaderpacksDir)) {
    if (!incomingShaderPacks.has(item.toLowerCase())) {
      fs.rmSync(path.join(shaderpacksDir, item), { recursive: true, force: true });
      onStatus(`Shader pack supprimé: ${item}`);
    }
  }

  // Activate resource packs and shaders
  for (const name of incomingResourcePacks.values()) {
    try { ensureResourcePack(mcGameDir, name); } catch (_) {}
  }
  for (const name of incomingShaderPacks.values()) {
    try { ensureShader(mcGameDir, name); } catch (_) {}
  }

  try { fs.unlinkSync(zipPath); } catch (_) {}

  if (serverKey) writeCache(mcGameDir, serverKey);

  onStatus(`Pack synchronisé: ${incomingMods.size} mods, ${incomingResourcePacks.size} resource packs, ${incomingShaderPacks.size} shaders.`);
  onProgress(1);
}

module.exports = { syncMods };
