const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  // Window
  minimize:    () => ipcRenderer.send('window:minimize'),
  maximize:    () => ipcRenderer.send('window:maximize'),
  close:       () => ipcRenderer.send('window:close'),

  // Config
  getConfig:   () => ipcRenderer.invoke('config:get'),
  saveConfig:  (data) => ipcRenderer.invoke('config:set', data),

  // Auth
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  login:         () => ipcRenderer.invoke('auth:login'),
  logout:        () => ipcRenderer.invoke('auth:logout'),

  // Game
  play:          () => ipcRenderer.invoke('launch:play'),
  syncMods:      () => ipcRenderer.invoke('launch:sync-mods'),

  // Server
  pingServer:    () => ipcRenderer.invoke('server:ping'),

  // Folders
  openInstance:  () => ipcRenderer.invoke('folder:instance'),
  openData:      () => ipcRenderer.invoke('folder:data'),

  // Logs
  exportLogs:    (text) => ipcRenderer.invoke('logs:export', text),

  // Events
  onStatus:      (cb) => ipcRenderer.on('status:update', (_, msg) => cb(msg)),
  onProgress:    (cb) => ipcRenderer.on('progress:update', (_, val) => cb(val)),
  onAuthCode:    (cb) => ipcRenderer.on('auth:code', (_, data) => cb(data)),
  onAuthDone:    (cb) => ipcRenderer.on('auth:done', (_, data) => cb(data)),
  onGameState:   (cb) => ipcRenderer.on('game:state', (_, state) => cb(state)),
});
