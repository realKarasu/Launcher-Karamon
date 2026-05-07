import type { LauncherApi, ModEntry } from '../../ipc/contract';

export class ModsList {
  private readonly api: LauncherApi;
  private readonly container: HTMLElement;
  private loaded = false;

  constructor(api: LauncherApi, container: HTMLElement) {
    this.api = api;
    this.container = container;
  }

  invalidate(): void {
    this.loaded = false;
  }

  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    const result = await this.api.listMods();
    this.render(result.mods);
    this.loaded = true;
  }

  private render(mods: ModEntry[]): void {
    this.container.textContent = '';
    if (mods.length === 0) {
      this.container.classList.remove('has-items');
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = 'Aucun mod installé. Synchronisez le pack pour les télécharger.';
      this.container.appendChild(p);
      return;
    }
    this.container.classList.add('has-items');
    const header = document.createElement('div');
    header.className = 'mods-toolbar';
    header.textContent = `${mods.length} mods · ${ModsList.formatSize(mods.reduce((a, m) => a + m.size, 0))}`;
    this.container.appendChild(header);

    for (const mod of mods) {
      const row = document.createElement('div');
      row.className = 'mod-row';
      const name = document.createElement('span');
      name.className = 'mod-name';
      name.textContent = mod.name;
      const size = document.createElement('span');
      size.className = 'mod-size';
      size.textContent = ModsList.formatSize(mod.size);
      row.append(name, size);
      this.container.appendChild(row);
    }
  }

  private static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
