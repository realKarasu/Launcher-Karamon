const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { syncMods } = require('./modSync');
const { ensureServer } = require('./minecraftSetup');

const MC_LAUNCHER_DIR = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const paths = require('./paths');

// All known locations where MinecraftLauncher.exe / Minecraft.exe can be found
const MC_LAUNCHER_CANDIDATES = [
  // Standard installer — Program Files (x86)
  'C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe',
  'C:\\Program Files (x86)\\Minecraft Launcher\\Minecraft.exe',
  'C:\\Program Files (x86)\\Minecraft Launcher\\minecraft.exe',
  // Standard installer — Program Files
  'C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe',
  'C:\\Program Files\\Minecraft Launcher\\Minecraft.exe',
  // AppData\Local
  path.join(os.homedir(), 'AppData', 'Local', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Minecraft Launcher', 'Minecraft.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Packages',
    'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local',
    'xal', 'launcher', 'minecraftlauncher.exe'),
  // AppData\Roaming
  path.join(os.homedir(), 'AppData', 'Roaming', 'Minecraft', 'MinecraftLauncher.exe'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Minecraft', 'Minecraft.exe'),
  // Desktop shortcuts (some users have it here)
  path.join(os.homedir(), 'Desktop', 'Minecraft.exe'),
  path.join(os.homedir(), 'Desktop', 'MinecraftLauncher.exe'),
];

// Scan common directories for any subfolder containing the exe
function searchInDir(baseDir, exeNames) {
  try {
    for (const sub of fs.readdirSync(baseDir)) {
      if (!sub.toLowerCase().includes('minecraft')) continue;
      const full = path.join(baseDir, sub);
      for (const exe of exeNames) {
        const candidate = path.join(full, exe);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch (_) {}
  return null;
}

function findMinecraftLauncher(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;

  for (const p of MC_LAUNCHER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }

  // Dynamic search in Program Files and AppData
  const exeNames = ['MinecraftLauncher.exe', 'Minecraft.exe', 'minecraft.exe', 'minecraftlauncher.exe'];
  const searchRoots = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    path.join(os.homedir(), 'AppData', 'Local'),
    path.join(os.homedir(), 'AppData', 'Roaming'),
  ];
  for (const root of searchRoots) {
    const found = searchInDir(root, exeNames);
    if (found) return found;
  }

  return null;
}

function instanceDir(config) {
  return config.mcGameDir || MC_LAUNCHER_DIR;
}

async function launch(config, onStatus, onProgress) {
  const gameDir = instanceDir(config);
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });

  // Register karamon.fr in servers.dat of the instance dir
  try {
    ensureServer(gameDir, 'karamon.fr', 'Karamon');
    onStatus('Serveur karamon.fr enregistré.');
  } catch (e) {
    onStatus('Avertissement: enregistrement serveur échoué (' + e.message + ')');
  }

  // Sync mods, resourcepacks, shaderpacks — fully awaited before spawning
  onStatus('Synchronisation des mods...');
  await syncMods(config.modpackUrl, gameDir, onStatus, (p) => onProgress(p * 0.9));

  // All done — open the Minecraft launcher
  const exe = findMinecraftLauncher(config.minecraftLauncherPath);
  if (!exe) {
    throw new Error(
      'Launcher Minecraft introuvable. Spécifie le chemin dans Paramètres → Chemin du Launcher.'
    );
  }

  onStatus('Lancement du launcher Minecraft...');
  onProgress(1);
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
}

async function syncOnly(config, onStatus, onProgress) {
  const gameDir = instanceDir(config);
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
  try { ensureServer(gameDir, 'karamon.fr', 'Karamon'); } catch (_) {}
  await syncMods(config.modpackUrl, gameDir, onStatus, onProgress);
}



module.exports = { launch, syncOnly, findMinecraftLauncher, instanceDir, mcLauncherDir: MC_LAUNCHER_DIR };
