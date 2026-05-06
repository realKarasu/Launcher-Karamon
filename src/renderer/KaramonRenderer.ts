import type { LauncherApi } from '../ipc/contract';
import { $, $button } from './util/dom';
import { Toast } from './components/Toast';
import { ConsoleView } from './components/ConsoleView';
import { ProgressBar } from './components/ProgressBar';
import { PlayButton } from './components/PlayButton';
import { ServerStatusPanel } from './components/ServerStatusPanel';
import { SettingsForm } from './components/SettingsForm';
import { Navigation } from './components/Navigation';
import { WindowControls } from './components/WindowControls';

export class KaramonRenderer {
  static readonly SERVER_PING_INTERVAL_MS = 30000;

  private readonly api: LauncherApi;
  private readonly console: ConsoleView;
  private readonly progress: ProgressBar;
  private readonly playButton: PlayButton;
  private readonly serverStatus: ServerStatusPanel;
  private readonly settings: SettingsForm;
  private gameRunning = false;
  private actionRunning = false;

  constructor(api: LauncherApi) {
    this.api = api;
    this.console = new ConsoleView({
      linesEl: $('console-lines'),
      wrapEl: $('console-wrap'),
      progressLabel: $('progress-label'),
    });
    this.progress = new ProgressBar($('progress-bar'), $('progress-label'));
    this.playButton = new PlayButton($('btn-play'), $('play-label'));
    this.serverStatus = new ServerStatusPanel({
      dotEl: $('status-dot'),
      textEl: $('status-text'),
      playersEl: $('server-players'),
      ping: () => api.pingServer(),
    });
    this.settings = new SettingsForm({
      api,
      onSaved: () => {
        Toast.show('Paramètres sauvegardés.', 'ok');
        this.console.log('Paramètres sauvegardés.', 'ok');
      },
    });
  }

  async start(): Promise<void> {
    Navigation.attach();
    WindowControls.attach(this.api);

    $('console-toggle').addEventListener('click', () => this.console.toggle());
    $('console-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.console.setOpen(false);
    });
    $('btn-logs-toggle').addEventListener('click', () => this.console.toggle());
    $('btn-play').addEventListener('click', () => this.play());
    $('btn-sync-mods').addEventListener('click', () => this.syncMods());
    $('btn-open-mods-folder').addEventListener('click', () => this.api.openInstance());
    $('btn-folder').addEventListener('click', () => this.api.openInstance());
    $('btn-export-logs').addEventListener('click', (e) => this.exportLogs(e));
    $('btn-clear-logs').addEventListener('click', (e) => {
      e.stopPropagation();
      this.console.clear();
    });

    this.settings.attach($('btn-save-settings'));
    this.wireIpcEvents();
    this.wireUpdateBar();
    this.wireCheckUpdateButton();

    this.console.log('Karamon Launcher démarré.', 'ok');

    await this.settings.load();

    const setup = await this.api.setupMinecraft();
    this.console.log('Instance: ' + setup.path, setup.ok ? 'ok' : 'warn');
    this.console.log('Setup: ' + setup.details, setup.ok ? 'ok' : 'warn');

    await this.serverStatus.refresh();
    setInterval(() => this.serverStatus.refresh(), KaramonRenderer.SERVER_PING_INTERVAL_MS);

    this.console.log('Prêt.', 'ok');
  }

  private wireIpcEvents(): void {
    this.api.onStatus((msg) => this.console.log(msg));
    this.api.onProgress((val) => this.progress.set(val));
    this.api.onGameState(({ running }) => {
      this.gameRunning = running;
      this.actionRunning = false;
      this.refreshPlayButton();
      if (running) {
        this.console.log('Launcher Minecraft ouvert !', 'ok');
        Toast.show('Launcher Minecraft ouvert !', 'ok');
      }
    });
  }

  private wireCheckUpdateButton(): void {
    const btn = $button('btn-check-update');
    const status = $('update-status');
    const idleLabel = 'Vérifier les mises à jour';
    let mode: 'check' | 'install' = 'check';

    btn.addEventListener('click', async () => {
      if (mode === 'install') {
        this.api.installUpdate();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Vérification…';
      status.textContent = 'Vérification en cours…';
      const result = await this.api.checkForUpdate();
      btn.disabled = false;
      switch (result.status) {
        case 'no-update':
          status.textContent = `À jour (v${result.currentVersion}).`;
          btn.textContent = idleLabel;
          break;
        case 'downloaded':
          status.textContent = `Mise à jour ${result.version} prête.`;
          btn.textContent = 'Installer maintenant';
          mode = 'install';
          break;
        case 'unsupported':
          status.textContent = 'Indisponible en mode développement.';
          btn.textContent = idleLabel;
          break;
        case 'error':
          status.textContent = 'Erreur : ' + result.error;
          btn.textContent = idleLabel;
          break;
      }
    });
  }

  private wireUpdateBar(): void {
    const bar = $('update-bar');
    const msg = $('update-msg');
    $('btn-install-update').addEventListener('click', () => this.api.installUpdate());
    $('btn-dismiss-update').addEventListener('click', () => bar.classList.remove('show'));
    this.api.onUpdateReady(({ version }) => {
      msg.textContent = `Mise à jour ${version} prête.`;
      bar.classList.add('show');
      this.console.log(`Mise à jour ${version} téléchargée.`, 'ok');
    });
  }

  private refreshPlayButton(): void {
    if (this.actionRunning) return this.playButton.setLoading();
    if (this.gameRunning) return this.playButton.setRunning();
    this.playButton.setIdle();
  }

  private async play(): Promise<void> {
    if (this.actionRunning) return;
    if (this.gameRunning) {
      Toast.show('Minecraft est déjà en cours.', 'error');
      return;
    }
    this.actionRunning = true;
    this.refreshPlayButton();
    this.console.log('Lancement en cours...', 'info');

    const result = await this.api.play();
    if (!result.ok) {
      this.actionRunning = false;
      this.refreshPlayButton();
      this.console.log('Erreur: ' + result.error, 'error');
      Toast.show(result.error, 'error');
    }
  }

  private async syncMods(): Promise<void> {
    const btn = $button('btn-sync-mods');
    btn.disabled = true;
    this.console.log('Synchronisation du pack en cours...', 'info');
    const result = await this.api.syncMods();
    btn.disabled = false;
    if (result.ok) {
      this.console.log('Pack synchronisé avec succès.', 'ok');
      Toast.show('Pack mis à jour !', 'ok');
    } else {
      this.console.log('Erreur sync pack: ' + result.error, 'error');
      Toast.show(result.error, 'error');
    }
  }

  private async exportLogs(e: Event): Promise<void> {
    e.stopPropagation();
    const result = await this.api.exportLogs(this.console.joined());
    if (result.ok) Toast.show('Logs exportés.', 'ok');
  }
}
