const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  // Window
  minimize:    () => ipcRenderer.send('window:minimize'),
  maximize:    () => ipcRenderer.send('window:maximize'),
  close:       () => ipcRenderer.send('window:close'),

  // Config
  getConfig:   () => ipcRenderer.invoke('config:get'),
  saveConfig:  (data) => ipcRenderer.invoke('config:set', data),

  // Minecraft setup
  setupMinecraft: () => ipcRenderer.invoke('minecraft:setup'),

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
  onGameState:   (cb) => ipcRenderer.on('game:state', (_, state) => cb(state)),
});
