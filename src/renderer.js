'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Karamon Launcher — renderer process
   ───────────────────────────────────────────────────────────────────────── */

const api = window.launcher;

// ── State ─────────────────────────────────────────────────────────────────────
let gameRunning  = false;
let actionRunning = false;
let consoleOpen  = true;
const logs       = [];

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
const modsUrlDisplay = $('mods-url-display');

// ── Particles background ──────────────────────────────────────────────────────
(function initParticles() {
  const canvas = $('particles-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.4 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,150,255,${p.a})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }
    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener('resize', () => { resize(); createParticles(); });
}());

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
$('console-toggle').addEventListener('click', () => {
  consoleOpen = !consoleOpen;
  consoleWrap.classList.toggle('collapsed', !consoleOpen);
});

// ── Log output ────────────────────────────────────────────────────────────────
function addLog(msg, type = '') {
  const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = `[${ts}] ${msg}`;
  logs.push(line);

  let cls = 'log-line';
  if (type) cls += ' log-' + type;
  else if (/error|erreur|échec/i.test(msg)) cls += ' log-error';
  else if (/warn|avertissement/i.test(msg))  cls += ' log-warn';
  else if (/ok|terminé|connecté|synchronis/i.test(msg)) cls += ' log-ok';
  else if (msg.startsWith('[MC]')) cls += ' log-mc';

  const el = document.createElement('div');
  el.className = cls;
  el.textContent = line;
  consoleLinesEl.appendChild(el);

  // Keep max 500 lines
  while (consoleLinesEl.children.length > 500) {
    consoleLinesEl.removeChild(consoleLinesEl.firstChild);
  }
  consoleLinesEl.scrollTop = consoleLinesEl.scrollHeight;

  // Mirror to progress label
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
  gameRunning = running;
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

// ── Sync mods button ──────────────────────────────────────────────────────────
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
$('btn-folder').addEventListener('click', () => api.openInstance());

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
  modsUrlDisplay.textContent       = cfg.modpackUrl || '—';
}

$('btn-save-settings').addEventListener('click', async () => {
  const updates = {
    memoryMb: parseInt($('cfg-memory').value) || 12288,
    jvmArgs:  $('cfg-jvm-args').value.trim(),
    javaPath: $('cfg-java-path').value.trim(),
    mcGameDir: $('cfg-mc-game-dir').value.trim(),
    minecraftLauncherPath: $('cfg-launcher-path').value.trim(),
    modpackUrl: $('cfg-modpack-url').value.trim(),
    closeLauncherOnGameStart: $('cfg-close-on-launch').checked,
    server: {
      host: $('cfg-server-host').value.trim(),
    },
  };
  await api.saveConfig(updates);
  modsUrlDisplay.textContent = updates.modpackUrl || '—';
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
    statusDot.className  = 'server-status-dot online';
    statusText.textContent = 'En ligne';
    serverPlayers.textContent = `${result.players} / ${result.maxPlayers}`;
  } else {
    statusDot.className  = 'server-status-dot offline';
    statusText.textContent = 'Hors ligne';
    serverPlayers.textContent = '—';
  }
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = getOrCreateToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getOrCreateToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  addLog('Karamon Launcher démarré.', 'ok');

  await loadSettings();

  // Setup Minecraft: servers.dat + Fabric version + profil launcher
  const setupResult = await api.setupMinecraft();
  addLog('Instance: ' + setupResult.path, setupResult.ok ? 'ok' : 'warn');
  addLog('Setup: ' + setupResult.details, setupResult.ok ? 'ok' : 'warn');

  await pingServer();
  setInterval(pingServer, 30000);

  addLog('Prêt.', 'ok');
}());
