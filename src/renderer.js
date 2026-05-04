'use strict';

const api = window.launcher;

// ── State ─────────────────────────────────────────────────────────────────────
let gameRunning   = false;
let actionRunning = false;
let consoleOpen   = false;
const logs        = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const btnPlay        = $('btn-play');
const playLabel      = $('play-label');
const progressBar    = $('progress-bar');
const progressLabel  = $('progress-label');
const consoleLinesEl = $('console-lines');
const consoleWrap    = $('console-wrap');
const statusDot      = $('status-dot');
const statusText     = $('status-text');
const serverPlayers  = $('server-players');

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn[data-panel]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('panel-' + btn.dataset.panel).classList.add('active');
  });
});

// ── Window controls ───────────────────────────────────────────────────────────
$('btn-minimize').addEventListener('click', () => api.minimize());
$('btn-maximize').addEventListener('click', () => api.maximize());
$('btn-close').addEventListener('click',   () => api.close());
$('drag-region').addEventListener('dblclick', () => api.maximize());

// ── Console toggle ────────────────────────────────────────────────────────────
function setConsole(open) {
  consoleOpen = open;
  consoleWrap.classList.toggle('open', consoleOpen);
  if (open) consoleLinesEl.scrollTop = consoleLinesEl.scrollHeight;
}

$('btn-logs-toggle').addEventListener('click', () => setConsole(!consoleOpen));
$('console-toggle').addEventListener('click',  () => setConsole(!consoleOpen));
$('console-close').addEventListener('click',   (e) => { e.stopPropagation(); setConsole(false); });

// ── Log output ────────────────────────────────────────────────────────────────
function addLog(msg, type = '') {
  const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = `[${ts}] ${msg}`;
  logs.push(line);

  let cls = 'log-line';
  if (type) cls += ' log-' + type;
  else if (/error|erreur|échec/i.test(msg))                  cls += ' log-error';
  else if (/warn|avertissement/i.test(msg))                  cls += ' log-warn';
  else if (/ok|terminé|connecté|synchronis/i.test(msg))     cls += ' log-ok';
  else if (msg.startsWith('[MC]'))                           cls += ' log-mc';

  const el = document.createElement('div');
  el.className = cls;
  el.textContent = line;
  consoleLinesEl.appendChild(el);

  while (consoleLinesEl.children.length > 500) {
    consoleLinesEl.removeChild(consoleLinesEl.firstChild);
  }
  if (consoleOpen) consoleLinesEl.scrollTop = consoleLinesEl.scrollHeight;

  if (!msg.startsWith('[MC]')) {
    progressLabel.textContent = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
  }
}

// ── IPC events ────────────────────────────────────────────────────────────────
api.onStatus((msg) => addLog(msg));

api.onProgress((val) => {
  const pct = Math.round(val * 100);
  progressBar.style.width = pct + '%';
  if (pct <= 0) progressLabel.textContent = 'Prêt';
  if (pct >= 100) {
    setTimeout(() => {
      progressBar.style.width = '0%';
      progressLabel.textContent = 'Prêt';
    }, 1500);
  }
});

api.onGameState(({ running }) => {
  gameRunning   = running;
  actionRunning = false;
  updatePlayButton();
  if (running) {
    addLog('Launcher Minecraft ouvert !', 'ok');
    showToast('Launcher Minecraft ouvert !', 'ok');
  }
});

// ── Play button ────────────────────────────────────────────────────────────────
btnPlay.addEventListener('click', async () => {
  if (actionRunning) return;
  if (gameRunning) {
    showToast('Minecraft est déjà en cours.', 'error');
    return;
  }
  actionRunning = true;
  updatePlayButton();
  addLog('Lancement en cours...', 'info');
  const result = await api.play();
  if (!result.ok) {
    actionRunning = false;
    updatePlayButton();
    addLog('Erreur: ' + result.error, 'error');
    showToast(result.error, 'error');
  }
});

function updatePlayButton() {
  if (actionRunning) {
    btnPlay.className = 'play-btn loading';
    playLabel.textContent = 'CHARGEMENT…';
    btnPlay.querySelector('.play-btn-icon').style.opacity = '0.5';
  } else if (gameRunning) {
    btnPlay.className = 'play-btn running';
    playLabel.textContent = 'EN JEU';
    btnPlay.querySelector('.play-btn-icon').style.opacity = '1';
  } else {
    btnPlay.className = 'play-btn';
    playLabel.textContent = 'JOUER';
    btnPlay.querySelector('.play-btn-icon').style.opacity = '1';
  }
}

// ── Sync mods ─────────────────────────────────────────────────────────────────
$('btn-sync-mods').addEventListener('click', async () => {
  const btn = $('btn-sync-mods');
  btn.disabled = true;
  addLog('Synchronisation des mods en cours...', 'info');
  const result = await api.syncMods();
  btn.disabled = false;
  if (result.ok) {
    addLog('Mods synchronisés avec succès.', 'ok');
    showToast('Mods mis à jour !', 'ok');
  } else {
    addLog('Erreur sync mods: ' + result.error, 'error');
    showToast(result.error, 'error');
  }
});

$('btn-open-mods-folder').addEventListener('click', () => api.openInstance());
$('btn-folder').addEventListener('click',           () => api.openInstance());

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const cfg = await api.getConfig();
  $('cfg-memory').value            = cfg.memoryMb || 12288;
  $('cfg-jvm-args').value          = cfg.jvmArgs || '';
  $('cfg-java-path').value         = cfg.javaPath || '';
  $('cfg-mc-game-dir').value       = cfg.mcGameDir || '';
  $('cfg-launcher-path').value     = cfg.minecraftLauncherPath || '';
  $('cfg-modpack-url').value       = cfg.modpackUrl || '';
  $('cfg-server-host').value       = cfg.server?.host || 'karamon.fr';
  $('cfg-close-on-launch').checked = cfg.closeLauncherOnGameStart || false;
}

$('btn-save-settings').addEventListener('click', async () => {
  const updates = {
    memoryMb:                  parseInt($('cfg-memory').value) || 12288,
    jvmArgs:                   $('cfg-jvm-args').value.trim(),
    javaPath:                  $('cfg-java-path').value.trim(),
    mcGameDir:                 $('cfg-mc-game-dir').value.trim(),
    minecraftLauncherPath:     $('cfg-launcher-path').value.trim(),
    modpackUrl:                $('cfg-modpack-url').value.trim(),
    closeLauncherOnGameStart:  $('cfg-close-on-launch').checked,
    server: {
      host: $('cfg-server-host').value.trim(),
    },
  };
  await api.saveConfig(updates);
  showToast('Paramètres sauvegardés.', 'ok');
  addLog('Paramètres sauvegardés.', 'ok');
});

// ── Console controls ──────────────────────────────────────────────────────────
$('btn-export-logs').addEventListener('click', async (e) => {
  e.stopPropagation();
  const result = await api.exportLogs(logs.join('\n'));
  if (result.ok) showToast('Logs exportés.', 'ok');
});

$('btn-clear-logs').addEventListener('click', (e) => {
  e.stopPropagation();
  consoleLinesEl.innerHTML = '';
  logs.length = 0;
  addLog('Console effacée.', 'info');
});

// ── Server ping ───────────────────────────────────────────────────────────────
async function pingServer() {
  const result = await api.pingServer();
  if (result.online) {
    statusDot.className        = 'server-status-dot online';
    statusText.textContent     = 'En ligne';
    serverPlayers.textContent  = `${result.players} / ${result.maxPlayers}`;
  } else {
    statusDot.className        = 'server-status-dot offline';
    statusText.textContent     = 'Hors ligne';
    serverPlayers.textContent  = '';
  }
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = document.querySelector('.toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

api.onUpdateReady(({ version }) => {
  const bar = $('update-bar');
  $('update-msg').textContent = `Mise à jour v${version} prête à installer`;
  bar.hidden = false;
  addLog(`Mise à jour v${version} prête à installer.`, 'ok');
  showToast(`Mise à jour v${version} disponible.`, 'ok');
});

$('btn-install-update').addEventListener('click', () => api.installUpdate());
$('btn-dismiss-update').addEventListener('click', () => { $('update-bar').hidden = true; });

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  addLog('Karamon Launcher démarré.', 'ok');

  await loadSettings();

  const setupResult = await api.setupMinecraft();
  addLog('Instance: ' + setupResult.path, setupResult.ok ? 'ok' : 'warn');
  addLog('Setup: ' + setupResult.details, setupResult.ok ? 'ok' : 'warn');

  await pingServer();
  setInterval(pingServer, 30000);

  addLog('Prêt.', 'ok');
}());
