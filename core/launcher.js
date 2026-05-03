const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { syncMods }   = require('./modSync');
const { ensureServer } = require('./minecraftSetup');
const paths = require('./paths');

const MC_LAUNCHER_DIR = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');

// ── Détection du launcher Minecraft ───────────────────────────────────────────

const EXE_CANDIDATES = [
  'C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe',
  'C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Minecraft', 'MinecraftLauncher.exe'),
];

function findLauncherExe(customPath) {
  if (customPath && fs.existsSync(customPath)) return { type: 'exe', path: customPath };
  for (const p of EXE_CANDIDATES) {
    if (fs.existsSync(p)) return { type: 'exe', path: p };
  }
  return null;
}

/**
 * Ouvre le Minecraft Launcher.
 * - Si un .exe est trouvé  → spawn direct
 * - Sinon (version Microsoft Store) → explorer.exe avec l'URI shell de l'app UWP
 */
function openMinecraftLauncher(customPath) {
  const found = findLauncherExe(customPath);

  if (found) {
    spawn(found.path, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  // Fallback Microsoft Store : lancer via shell:AppsFolder
  // L'ID du package UWP officiel Minecraft
  const uwpId = 'Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft';
  spawn('explorer.exe', [`shell:AppsFolder\\${uwpId}`], {
    detached: true, stdio: 'ignore',
  }).unref();
}

// ── Instance dir ───────────────────────────────────────────────────────────────

function instanceDir(config) {
  return config.mcGameDir || MC_LAUNCHER_DIR;
}

// ── Launch ─────────────────────────────────────────────────────────────────────

async function launch(config, onStatus, onProgress) {
  const gameDir = instanceDir(config);
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });

  try { ensureServer(gameDir, 'karamon.fr', 'Karamon'); } catch (_) {}

  onStatus('Synchronisation des mods...');
  await syncMods(config.modpackUrl, gameDir, onStatus, (p) => onProgress(p * 0.9));

  onStatus('Lancement du launcher Minecraft...');
  onProgress(1);
  openMinecraftLauncher(config.minecraftLauncherPath);
}

// ── Sync only ──────────────────────────────────────────────────────────────────

async function syncOnly(config, onStatus, onProgress) {
  const gameDir = instanceDir(config);
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
  try { ensureServer(gameDir, 'karamon.fr', 'Karamon'); } catch (_) {}
  await syncMods(config.modpackUrl, gameDir, onStatus, onProgress);
}

module.exports = { launch, syncOnly, instanceDir, mcLauncherDir: MC_LAUNCHER_DIR };
