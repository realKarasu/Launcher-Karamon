import type { AppConfig, AppConfigUpdate, LauncherApi } from '../../ipc/contract';
import { $input } from '../util/dom';

export interface SettingsFormOptions {
  api: LauncherApi;
  onSaved: (updates: AppConfigUpdate) => void;
}

export class SettingsForm {
  static readonly DEFAULT_MEMORY_MB = 12288;
  static readonly DEFAULT_HOST = 'play.karamon.fr';

  private readonly api: LauncherApi;
  private readonly onSaved: (updates: AppConfigUpdate) => void;

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
    $input('cfg-server-host').value = cfg.server?.host ?? SettingsForm.DEFAULT_HOST;
    $input('cfg-close-on-launch').checked = cfg.closeLauncherOnGameStart ?? false;
    return cfg;
  }

  attach(saveButton: HTMLElement): void {
    saveButton.addEventListener('click', async () => {
      const updates = this.collect();
      await this.api.saveConfig(updates);
      this.onSaved(updates);
    });
  }

  private collect(): AppConfigUpdate {
    return {
      memoryMb: parseInt($input('cfg-memory').value, 10) || SettingsForm.DEFAULT_MEMORY_MB,
      jvmArgs: $input('cfg-jvm-args').value.trim(),
      javaPath: $input('cfg-java-path').value.trim(),
      mcGameDir: $input('cfg-mc-game-dir').value.trim(),
      minecraftLauncherPath: $input('cfg-launcher-path').value.trim(),
      closeLauncherOnGameStart: $input('cfg-close-on-launch').checked,
      server: { host: $input('cfg-server-host').value.trim() },
    };
  }
}
