const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const DEFAULTS = {
  modpackUrl: 'https://github.com/realKarasu/Launcher-Karamon/releases/download/mods/karamon-pack.zip',
  mcGameDir: '',            // empty = auto (%APPDATA%\.minecraft)
  minecraftLauncherPath: '', // empty = auto-detect
  memoryMb: 12288,
  javaPath: '',
  jvmArgs: '',
  closeLauncherOnGameStart: false,
  server: {
    host: 'karamon.fr',
    port: 25565,
  },
};

let _data = null;

function load() {
  try {
    if (fs.existsSync(paths.configFile)) {
      const raw = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
      _data = {
        ...DEFAULTS,
        ...raw,
        server: { ...DEFAULTS.server, ...(raw.server || {}) },
      };
      return;
    }
  } catch (_) { /* use defaults */ }
  _data = JSON.parse(JSON.stringify(DEFAULTS));
}

function save() {
  fs.mkdirSync(path.dirname(paths.configFile), { recursive: true });
  fs.writeFileSync(paths.configFile, JSON.stringify(_data, null, 2), 'utf8');
}

function get() {
  if (!_data) load();
  return JSON.parse(JSON.stringify(_data));
}

function set(updates) {
  if (!_data) load();
  _data = {
    ..._data,
    ...updates,
    server: { ..._data.server, ...(updates.server || {}) },
  };
  save();
}

module.exports = { get, set, load };
