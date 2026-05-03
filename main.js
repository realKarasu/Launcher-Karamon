const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron/main');
const path = require('path');
const fs = require('fs');

const config    = require('./core/config');
const auth      = require('./core/auth');
const launcher  = require('./core/launcher');
const pingServer = require('./core/serverPing');
const paths     = require('./core/paths');

// ── Window ────────────────────────────────────────────────────────────────────

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function onStatus(msg) { send('status:update', msg); }
function onProgress(val) { send('progress:update', Math.max(0, Math.min(1, val))); }

// ── Window controls ────────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── Config ─────────────────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => config.get());
ipcMain.handle('config:set', (_, updates) => {
  config.set(updates);
  return config.get();
});

// ── Auth ───────────────────────────────────────────────────────────────────────

ipcMain.handle('auth:status', () => {
  const name = auth.cachedAccountName();
  return { authenticated: !!name, profileName: name };
});

ipcMain.handle('auth:login', async () => {
  const cfg = config.get();
  try {
    const session = await auth.ensureAuthenticated(
      cfg.microsoftClientId,
      cfg.checkOwnershipEveryLaunch,
      onStatus,
      (codeData) => send('auth:code', codeData)
    );
    send('auth:done', { profileName: session.profileName });
    return { ok: true, profileName: session.profileName };
  } catch (e) {
    onStatus('Erreur de connexion: ' + e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('auth:logout', () => {
  auth.clearCache();
  return { ok: true };
});

// ── Play ───────────────────────────────────────────────────────────────────────

let gameProcess = null;

ipcMain.handle('launch:play', async () => {
  if (gameProcess && gameProcess.exitCode === null) {
    return { ok: false, error: 'Minecraft est déjà lancé.' };
  }

  const cfg = config.get();

  try {
    onStatus('Connexion au compte Microsoft...');
    onProgress(0);

    const session = await auth.ensureAuthenticated(
      cfg.microsoftClientId,
      cfg.checkOwnershipEveryLaunch,
      onStatus,
      (codeData) => send('auth:code', codeData)
    );

    gameProcess = await launcher.launch(cfg, session, onStatus, onProgress);

    send('game:state', { running: true });

    gameProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) if (line.trim()) onStatus('[MC] ' + line.trim());
    });
    gameProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) if (line.trim()) onStatus('[MC] ' + line.trim());
    });
    gameProcess.on('close', (code) => {
      gameProcess = null;
      send('game:state', { running: false });
      onStatus(`Minecraft fermé (code ${code}).`);
      onProgress(0);
    });

    if (cfg.closeLauncherOnGameStart) {
      setTimeout(() => mainWindow?.close(), 2000);
    }

    return { ok: true };
  } catch (e) {
    onStatus('Erreur de lancement: ' + e.message);
    onProgress(0);
    send('game:state', { running: false });
    return { ok: false, error: e.message };
  }
});

// ── Sync mods only ─────────────────────────────────────────────────────────────

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

// ── Server ping ────────────────────────────────────────────────────────────────

ipcMain.handle('server:ping', async () => {
  const cfg = config.get();
  try {
    const result = await pingServer(cfg.server.host, cfg.server.port, 5000);
    return result;
  } catch (_) {
    return { online: false };
  }
});

// ── Open folders ───────────────────────────────────────────────────────────────

ipcMain.handle('folder:instance', () => {
  const cfg = config.get();
  const dir = paths.instanceDir(cfg.instanceName);
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

ipcMain.handle('folder:data', () => {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  shell.openPath(paths.dataDir);
});

// ── Export logs ────────────────────────────────────────────────────────────────

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
