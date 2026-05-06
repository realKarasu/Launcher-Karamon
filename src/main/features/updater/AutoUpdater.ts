import { app } from 'electron/main';
import { autoUpdater, type UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { UpdateCheckResult, UpdateInfo } from '../../../ipc/contract';

export interface AutoUpdaterOptions {
  onReady: (info: UpdateInfo) => void;
}

export class AutoUpdater {
  private readonly onReady: (info: UpdateInfo) => void;
  private downloadedVersion: string | null = null;

  constructor({ onReady }: AutoUpdaterOptions) {
    this.onReady = onReady;
  }

  start(): void {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      if (info.version === app.getVersion()) return;
      this.downloadedVersion = info.version;
      this.onReady({ version: info.version });
    });

    autoUpdater.on('error', () => {
      /* silent */
    });

    autoUpdater.checkForUpdates().catch(() => {
      /* silent if no network */
    });
  }

  async check(): Promise<UpdateCheckResult> {
    if (!app.isPackaged) return { status: 'unsupported' };
    if (this.downloadedVersion) {
      return { status: 'downloaded', version: this.downloadedVersion };
    }

    return new Promise<UpdateCheckResult>((resolve) => {
      const cleanup = (): void => {
        autoUpdater.removeListener('update-not-available', onNotAvail);
        autoUpdater.removeListener('update-downloaded', onDownloaded);
        autoUpdater.removeListener('error', onError);
      };
      const onNotAvail = (): void => {
        cleanup();
        resolve({ status: 'no-update', currentVersion: app.getVersion() });
      };
      const onDownloaded = (info: ElectronUpdateInfo): void => {
        cleanup();
        this.downloadedVersion = info.version;
        resolve({ status: 'downloaded', version: info.version });
      };
      const onError = (e: Error): void => {
        cleanup();
        resolve({ status: 'error', error: e.message });
      };

      autoUpdater.once('update-not-available', onNotAvail);
      autoUpdater.once('update-downloaded', onDownloaded);
      autoUpdater.once('error', onError);

      autoUpdater.checkForUpdates().catch((e) => onError(e as Error));
    });
  }

  installNow(): void {
    autoUpdater.quitAndInstall(false, true);
  }
}
