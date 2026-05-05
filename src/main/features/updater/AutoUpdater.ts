import { app } from 'electron/main';
import { autoUpdater, type UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { UpdateInfo } from '../../../ipc/contract';

export interface AutoUpdaterOptions {
  onReady: (info: UpdateInfo) => void;
}

export class AutoUpdater {
  private readonly onReady: (info: UpdateInfo) => void;

  constructor({ onReady }: AutoUpdaterOptions) {
    this.onReady = onReady;
  }

  start(): void {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      if (info.version === app.getVersion()) return;
      this.onReady({ version: info.version });
    });

    autoUpdater.on('error', () => {
      /* silent */
    });

    autoUpdater.checkForUpdates().catch(() => {
      /* silent if no network */
    });
  }

  installNow(): void {
    autoUpdater.quitAndInstall(false, true);
  }
}
