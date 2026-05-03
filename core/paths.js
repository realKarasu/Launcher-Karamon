const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), 'AppData', 'Roaming', '.karamon-launcher');

module.exports = {
  dataDir:      DATA_DIR,
  authCache:    path.join(DATA_DIR, 'auth.json'),
  configFile:   path.join(DATA_DIR, 'config.json'),
  versionsDir:  path.join(DATA_DIR, 'versions'),
  librariesDir: path.join(DATA_DIR, 'libraries'),
  assetsDir:    path.join(DATA_DIR, 'assets'),
  cacheDir:     path.join(DATA_DIR, 'cache'),
  instancesDir: path.join(DATA_DIR, 'instances'),
  logsDir:      path.join(DATA_DIR, 'logs'),

  instanceDir(instanceName) {
    return path.join(DATA_DIR, 'instances', instanceName);
  },
  modsDir(instanceName) {
    return path.join(DATA_DIR, 'instances', instanceName, 'mods');
  },
  nativesDir(versionId) {
    return path.join(DATA_DIR, 'versions', versionId, 'natives');
  },
};
