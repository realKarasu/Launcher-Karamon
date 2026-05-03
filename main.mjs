import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron/main';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// CJS require for our own core modules
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config        = require('./core/config.js');
const launcher      = require('./core/launcher.js');
const pingServer    = require('./core/serverPing.js');
const paths         = require('./core/paths.js');
const { ensureServer, ensureFabricVersion, ensureProfile } = require('./core/minecraftSetup.js');

// ── Window ─────────────────────────────────────────────────��───────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 580,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Helpers ───────────────────────────────────���────────────────────────────────

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, data);
}

const onStatus   = (msg) => send('status:update', msg);
const onProgress = (val) => send('progress:update', Math.max(0, Math.min(1, val)));

// ── Window controls ────────────────────────────────���──────────────────────────���

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── Config ────────────────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => config.get());
ipcMain.handle('config:set', (_, updates) => { config.set(updates); return config.get(); });

// ── Minecraft setup (servers.dat + profile + Fabric) ─────────────────────────

ipcMain.handle('minecraft:setup', async () => {
  const os    = require('os');
  const p     = require('path');
  const cfg   = config.get();
  const mcDir = cfg.mcGameDir || p.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
  const results = [];

  // 1 — servers.dat
  try {
    ensureServer(mcDir, 'karamon.fr', 'Karamon');
    results.push('servers.dat ✓');
  } catch (e) {
    results.push('servers.dat ✗ ' + e.message);
  }

  // 2 — Fabric version JSON (downloaded from Fabric meta if missing)
  try {
    await ensureFabricVersion(mcDir);
    results.push('Fabric version ✓');
  } catch (e) {
    results.push('Fabric version ✗ ' + e.message);
  }

  // 3 — launcher_profiles.json
  try {
    ensureProfile(mcDir, cfg);
    results.push('Profil Karamon ✓');
  } catch (e) {
    results.push('Profil ✗ ' + e.message);
  }

  const allOk = results.every(r => r.includes('✓'));
  return { ok: allOk, details: results.join(' | '), path: mcDir };
});

// ── Play — sync mods puis ouvre le launcher Minecraft officiel ─────────────────

ipcMain.handle('launch:play', async () => {
  const cfg = config.get();
  try {
    onProgress(0);
    await launcher.launch(cfg, onStatus, onProgress);
    send('game:state', { running: true });
    onStatus('Launcher Minecraft ouvert !');
    if (cfg.closeLauncherOnGameStart) setTimeout(() => mainWindow?.close(), 2000);
    return { ok: true };
  } catch (e) {
    onStatus('Erreur: ' + e.message);
    onProgress(0);
    send('game:state', { running: false });
    return { ok: false, error: e.message };
  }
});

// ── Sync mods ──────────────────────────────────────────────────────────────────

ipcMain.handle('launch:sync-mods', async () => {
  const cfg = config.get();
  try {
    onProgress(0);
    await launcher.syncOnly(cfg, onStatus, onProgress);
    onProgress(1);
    return { ok: true };
  } catch (e) {
    onStatus('Erreur de synchronisation: ' + e.message);
    onProgress(0);
    return { ok: false, error: e.message };
  }
});

// ── Server ping ────────────────────────────────────────────────────────────��───

ipcMain.handle('server:ping', async () => {
  const cfg = config.get();
  try { return await pingServer(cfg.server.host, cfg.server.port, 5000); }
  catch (_) { return { online: false }; }
});

// ── Folders ───────────────────────────────────────────────────────────────��────

ipcMain.handle('folder:instance', () => {
  const os  = require('os');
  const p   = require('path');
  const cfg = config.get();
  const dir = cfg.mcGameDir || p.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

ipcMain.handle('folder:data', () => {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  shell.openPath(paths.dataDir);
});

// ── Export logs ──────────────────────────────────────────────────────��─────────

ipcMain.handle('logs:export', async (_, logsText) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter les logs',
    defaultPath: path.join(app.getPath('desktop'), `karamon-logs-${Date.now()}.txt`),
    filters: [{ name: 'Fichiers texte', extensions: ['txt'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, logsText, 'utf8');
    return { ok: true };
  }
  return { ok: false };
});
