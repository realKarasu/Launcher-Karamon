import type { AppConfig, LauncherApi } from '../../ipc/contract';

export type Theme = 'red' | 'gold';

export class ThemeSwitcher {
  private readonly api: LauncherApi;
  private current: Theme = 'red';

  constructor(api: LauncherApi) {
    this.api = api;
  }

  apply(theme: Theme): void {
    this.current = theme;
    document.body.classList.toggle('theme-gold', theme === 'gold');
    document.querySelectorAll<HTMLElement>('.theme-swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.theme === theme);
    });
  }

  attach(): void {
    document.querySelectorAll<HTMLElement>('.theme-swatch').forEach((s) => {
      s.addEventListener('click', async () => {
        const theme = (s.dataset.theme as Theme) || 'red';
        if (theme === this.current) return;
        this.apply(theme);
        await this.api.saveConfig({ theme });
      });
    });
  }

  fromConfig(cfg: AppConfig): void {
    this.apply(cfg.theme === 'gold' ? 'gold' : 'red');
  }
}
