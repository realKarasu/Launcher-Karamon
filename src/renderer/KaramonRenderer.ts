import type { LauncherApi, MinecraftProfile } from '../ipc/contract';
import { $, $button, $opt } from './util/dom';
import { Toast } from './components/Toast';
import { ConsoleView } from './components/ConsoleView';
import { ProgressBar } from './components/ProgressBar';
import { PlayButton } from './components/PlayButton';
import { ServerStatusPanel } from './components/ServerStatusPanel';
import { SettingsForm } from './components/SettingsForm';
import { Navigation } from './components/Navigation';
import { WindowControls } from './components/WindowControls';
import { ModsList } from './components/ModsList';
import { StatsView } from './components/StatsView';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Konami } from './components/Konami';
import { ScreenshotsView } from './components/ScreenshotsView';
import { PlayersSparkline } from './components/PlayersSparkline';
import { QuickLinks } from './components/QuickLinks';
import { JvmPresets } from './components/JvmPresets';
import { ToolsView } from './components/ToolsView';
import { ShopView } from './components/ShopView';
import { AccountChip } from './components/AccountChip';
import type { PingResult } from '../ipc/contract';

export class KaramonRenderer {
  static readonly SERVER_PING_INTERVAL_MS = 30000;
  static readonly POKEBALL_ANIM_MS = 2200;

  private readonly api: LauncherApi;
  private readonly console: ConsoleView;
  private readonly progress: ProgressBar;
  private readonly playButton: PlayButton;
  private readonly serverStatus: ServerStatusPanel;
  private readonly settings: SettingsForm;
  private readonly mods: ModsList;
  private readonly stats: StatsView;
  private readonly theme: ThemeSwitcher;
  private readonly screenshots: ScreenshotsView;
  private readonly sparkline: PlayersSparkline;
  private readonly tools: ToolsView;
  private readonly shop: ShopView;
  private readonly accountChip: AccountChip;
  private gameRunning = false;
  private actionRunning = false;
  private authProfile: MinecraftProfile | null = null;

  constructor(api: LauncherApi) {
    this.api = api;
    this.console = new ConsoleView({
      linesEl: $('console-lines'),
      wrapEl: $('console-wrap'),
      progressLabel: $('progress-label'),
    });
    this.progress = new ProgressBar($('progress-bar'), $('progress-label'));
    this.playButton = new PlayButton($('btn-play'), $('play-label'));
    this.sparkline = new PlayersSparkline(
      document.getElementById('sparkline-path') as unknown as SVGPathElement,
    );
    this.serverStatus = new ServerStatusPanel({
      dotEl: $('status-dot'),
      textEl: $('status-text'),
      playersEl: $('server-players'),
      tooltipEl: $opt('players-tooltip'),
      ping: () => api.pingServer(),
      onResult: (r, prev) => this.onPingResult(r, prev),
    });
    this.settings = new SettingsForm({
      api,
      onSaved: () => {
        Toast.show('Paramètres sauvegardés.', 'ok');
        this.console.log('Paramètres sauvegardés.', 'ok');
      },
    });
    this.mods = new ModsList(api, $('mods-list'));
    this.stats = new StatsView(api);
    this.theme = new ThemeSwitcher(api);
    this.screenshots = new ScreenshotsView(api, $('screenshots-grid'));
    this.tools = new ToolsView(api);
    this.shop = new ShopView(api);
    this.accountChip = new AccountChip($('account-chip'), () => void this.handleLogout());
  }

  private onPingResult(r: PingResult, prev: 'online' | 'offline' | 'unknown'): void {
    this.sparkline.push(r.online ? r.players : null);
    if (prev === 'unknown') return;
    if (r.online && prev === 'offline') {
      this.notify('Serveur en ligne', 'Karamon est de retour !');
    } else if (!r.online && prev === 'online') {
      this.notify('Serveur hors ligne', 'Karamon vient de s’arrêter.');
    }
  }

  private notify(title: string, body: string): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') new Notification(title, { body });
      });
    }
  }

  async start(): Promise<void> {
    Navigation.attach((panel) => this.onPanelChange(panel));
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
    $('btn-repair-pack').addEventListener('click', () => this.repair());
    $('btn-reset-stats').addEventListener('click', () => this.resetStats());

    this.theme.attach();
    QuickLinks.render(this.api, $('nav-links'));
    JvmPresets.attach();
    this.settings.attach($('btn-save-settings'));
    this.wireIpcEvents();
    this.wireUpdateBar();
    this.wireCheckUpdateButton();
    Konami.attach(() => this.fireKonami());
    await this.refreshAuthState();

    this.console.log('Karamon Launcher démarré.', 'ok');

    const cfg = await this.settings.load();
    JvmPresets.syncFromArgs();
    this.theme.fromConfig(cfg);

    void this.settings.loadSystemInfo();
    void this.settings.populateJava();
    void this.stats.refresh();

    const setup = await this.api.setupMinecraft();
    this.console.log('Instance: ' + setup.path, setup.ok ? 'ok' : 'warn');
    this.console.log('Setup: ' + setup.details, setup.ok ? 'ok' : 'warn');

    await this.serverStatus.refresh();
    setInterval(() => this.serverStatus.refresh(), KaramonRenderer.SERVER_PING_INTERVAL_MS);

    this.console.log('Prêt.', 'ok');
  }

  private onPanelChange(panel: string): void {
    if (panel === 'mods') void this.mods.load();
    if (panel === 'home') void this.stats.refresh();
    if (panel === 'settings') void this.stats.refresh();
    if (panel === 'screenshots') void this.screenshots.load();
    if (panel === 'tools') void this.tools.load();
    if (panel === 'shop') this.shop.attach();
  }

  private fireKonami(): void {
    const overlay = $('pokeball-overlay');
    overlay.classList.remove('fire');
    void overlay.offsetWidth;
    overlay.classList.add('fire');
    setTimeout(() => overlay.classList.remove('fire'), KaramonRenderer.POKEBALL_ANIM_MS);
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
        void this.stats.refresh();
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
    if (!this.authProfile) return this.playButton.setLoginRequired();
    this.playButton.setIdle();
  }

  private async refreshAuthState(): Promise<void> {
    const session = await this.api.authGetSession();
    this.authProfile = session.signedIn ? session.profile : null;
    this.accountChip.render(this.authProfile);
    this.refreshPlayButton();
  }

  private async handleLogin(): Promise<void> {
    if (this.actionRunning) return;
    this.actionRunning = true;
    this.playButton.setLoading();
    try {
      const result = await this.api.authLogin();
      if (result.ok) {
        this.authProfile = result.profile;
        this.accountChip.render(this.authProfile);
        Toast.show(`Connecté en tant que ${result.profile.name}.`, 'ok');
        this.console.log(`Connecté : ${result.profile.name}`, 'ok');
      } else {
        Toast.show(result.error, 'error');
        this.console.log('Erreur connexion: ' + result.error, 'error');
      }
    } finally {
      this.actionRunning = false;
      this.refreshPlayButton();
    }
  }

  private async handleLogout(): Promise<void> {
    if (!this.authProfile) return;
    const ok = window.confirm(`Se déconnecter de ${this.authProfile.name} ?`);
    if (!ok) return;
    await this.api.authLogout();
    this.authProfile = null;
    this.accountChip.render(null);
    this.refreshPlayButton();
    Toast.show('Déconnecté.', 'ok');
  }

  private async play(): Promise<void> {
    if (this.actionRunning) return;
    if (!this.authProfile) {
      void this.handleLogin();
      return;
    }
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
      this.mods.invalidate();
      void this.mods.load(true);
    } else {
      this.console.log('Erreur sync pack: ' + result.error, 'error');
      Toast.show(result.error, 'error');
    }
  }

  private async repair(): Promise<void> {
    const btn = $button('btn-repair-pack');
    btn.disabled = true;
    this.console.log('Réparation du pack en cours...', 'info');
    const result = await this.api.repair();
    btn.disabled = false;
    if (result.ok) {
      this.console.log('Pack réparé.', 'ok');
      Toast.show('Pack réparé !', 'ok');
      this.mods.invalidate();
      void this.mods.load(true);
    } else {
      this.console.log('Erreur réparation: ' + result.error, 'error');
      Toast.show(result.error, 'error');
    }
  }

  private async resetStats(): Promise<void> {
    await this.stats.reset();
    Toast.show('Statistiques réinitialisées.', 'ok');
  }

  private async exportLogs(e: Event): Promise<void> {
    e.stopPropagation();
    const result = await this.api.exportLogs(this.console.joined());
    if (result.ok) Toast.show('Logs exportés.', 'ok');
  }
}
