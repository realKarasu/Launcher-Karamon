import { contextBridge, ipcRenderer } from 'electron';
import { Channels, type LauncherApi } from '../ipc/contract';

const api: LauncherApi = {
  minimize: () => ipcRenderer.send(Channels.windowMinimize),
  maximize: () => ipcRenderer.send(Channels.windowMaximize),
  close: () => ipcRenderer.send(Channels.windowClose),

  getConfig: () => ipcRenderer.invoke(Channels.configGet),
  saveConfig: (updates) => ipcRenderer.invoke(Channels.configSet, updates),

  setupMinecraft: () => ipcRenderer.invoke(Channels.minecraftSetup),

  play: () => ipcRenderer.invoke(Channels.launchPlay),
  syncMods: () => ipcRenderer.invoke(Channels.launchSyncMods),

  pingServer: () => ipcRenderer.invoke(Channels.serverPing),

  openInstance: () => ipcRenderer.invoke(Channels.folderInstance),
  openData: () => ipcRenderer.invoke(Channels.folderData),

  exportLogs: (text) => ipcRenderer.invoke(Channels.logsExport, text),

  installUpdate: () => ipcRenderer.send(Channels.updateInstall),
  checkForUpdate: () => ipcRenderer.invoke(Channels.updateCheck),

  onStatus: (cb) => {
    ipcRenderer.on(Channels.eventStatus, (_e, msg: string) => cb(msg));
  },
  onProgress: (cb) => {
    ipcRenderer.on(Channels.eventProgress, (_e, val: number) => cb(val));
  },
  onGameState: (cb) => {
    ipcRenderer.on(Channels.eventGameState, (_e, state) => cb(state));
  },
  onUpdateReady: (cb) => {
    ipcRenderer.on(Channels.eventUpdateReady, (_e, info) => cb(info));
  },
};

contextBridge.exposeInMainWorld('launcher', api);
