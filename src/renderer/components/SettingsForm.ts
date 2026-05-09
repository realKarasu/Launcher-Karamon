import type {
  AppConfig,
  AppConfigUpdate,
  JavaCandidate,
  LauncherApi,
  SystemInfo,
} from '../../ipc/contract';
import { $, $input, $opt } from '../util/dom';

export interface SettingsFormOptions {
  api: LauncherApi;
  onSaved: (updates: AppConfigUpdate) => void;
}

export class SettingsForm {
  static readonly DEFAULT_MEMORY_MB = 12288;

  private readonly api: LauncherApi;
  private readonly onSaved: (updates: AppConfigUpdate) => void;
  private systemInfo: SystemInfo | null = null;

  constructor({ api, onSaved }: SettingsFormOptions) {
    this.api = api;
    this.onSaved = onSaved;
  }

  async load(): Promise<AppConfig> {
    const cfg = await this.api.getConfig();
    $input('cfg-memory').value = String(cfg.memoryMb || SettingsForm.DEFAULT_MEMORY_MB);
    $input('cfg-jvm-args').value = cfg.jvmArgs ?? '';
    $input('cfg-java-path').value = cfg.javaPath ?? '';
    $input('cfg-mc-game-dir').value = cfg.mcGameDir ?? '';
    $input('cfg-launcher-path').value = cfg.minecraftLauncherPath ?? '';
    $input('cfg-close-on-launch').checked = cfg.closeLauncherOnGameStart ?? false;
    return cfg;
  }

  attach(saveButton: HTMLElement): void {
    saveButton.addEventListener('click', async () => {
      const updates = this.collect();
      await this.api.saveConfig(updates);
      this.onSaved(updates);
    });
    $input('cfg-memory').addEventListener('input', () => this.refreshRamHint());
    const select = $opt('cfg-java-select');
    if (select instanceof HTMLSelectElement) {
      select.addEventListener('change', () => {
        $input('cfg-java-path').value = select.value;
      });
    }
    const rescan = $opt('btn-rescan-java');
    if (rescan instanceof HTMLButtonElement) {
      rescan.addEventListener('click', () => this.populateJava(true));
    }
  }

  async populateJava(rescan = false): Promise<void> {
    const select = $opt('cfg-java-select');
    if (!(select instanceof HTMLSelectElement)) return;
    const current = $input('cfg-java-path').value.trim();
    select.disabled = true;
    if (rescan) select.innerHTML = '<option value="">Recherche…</option>';

    let list: JavaCandidate[] = [];
    try {
      list = await this.api.listJava();
    } catch {
      list = [];
    }
    select.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Java système (auto)';
    select.appendChild(auto);
    for (const j of list) {
      const opt = document.createElement('option');
      opt.value = j.path;
      opt.textContent = `${j.vendor} ${j.version} — ${j.path}`;
      select.appendChild(opt);
    }
    if (current && !list.find((j) => j.path === current)) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = `Personnalisé — ${current}`;
      select.appendChild(opt);
    }
    select.value = current;
    select.disabled = false;
  }

  async loadSystemInfo(): Promise<SystemInfo> {
    this.systemInfo = await this.api.systemInfo();
    const ram = `${(this.systemInfo.totalMemMb / 1024).toFixed(1)} Go`;
    SettingsForm.setText('sys-ram', ram);
    SettingsForm.setText('sys-cpu', `${this.systemInfo.cpuCount} cœurs`);
    SettingsForm.setText('sys-os', `${this.systemInfo.platform} ${this.systemInfo.arch}`);
    this.refreshRamHint();
    return this.systemInfo;
  }

  private refreshRamHint(): void {
    const hint = $('ram-hint');
    const value = parseInt($input('cfg-memory').value, 10) || 0;
    if (!this.systemInfo) {
      hint.textContent = 'Recommandé : 8192–12288 Mo (8–12 Go)';
      hint.classList.remove('warn');
      return;
    }
    const total = this.systemInfo.totalMemMb;
    const ratio = value / total;
    if (value > total) {
      hint.textContent = `⚠ Plus que la RAM totale (${total} Mo). Réduisez.`;
      hint.classList.add('warn');
    } else if (ratio > 0.75) {
      hint.textContent = `⚠ Très élevé (${Math.round(ratio * 100)}% de la RAM totale).`;
      hint.classList.add('warn');
    } else if (ratio > 0.5) {
      hint.textContent = `Élevé (${Math.round(ratio * 100)}% de la RAM). RAM totale : ${total} Mo.`;
      hint.classList.remove('warn');
    } else {
      hint.textContent = `OK — RAM totale : ${total} Mo.`;
      hint.classList.remove('warn');
    }
  }

  private static setText(id: string, value: string): void {
    const el = $opt(id);
    if (el) el.textContent = value;
  }

  private collect(): AppConfigUpdate {
    return {
      memoryMb: parseInt($input('cfg-memory').value, 10) || SettingsForm.DEFAULT_MEMORY_MB,
      jvmArgs: $input('cfg-jvm-args').value.trim(),
      javaPath: $input('cfg-java-path').value.trim(),
      mcGameDir: $input('cfg-mc-game-dir').value.trim(),
      minecraftLauncherPath: $input('cfg-launcher-path').value.trim(),
      closeLauncherOnGameStart: $input('cfg-close-on-launch').checked,
    };
  }
}
