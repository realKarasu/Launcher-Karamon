import type { LauncherApi, ScreenshotEntry } from '../../ipc/contract';
import { $ } from '../util/dom';

export class ScreenshotsView {
  private readonly api: LauncherApi;
  private readonly grid: HTMLElement;
  private loaded = false;

  constructor(api: LauncherApi, grid: HTMLElement) {
    this.api = api;
    this.grid = grid;
    this.attachLightbox();
  }

  invalidate(): void {
    this.loaded = false;
  }

  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    const result = await this.api.listScreenshots();
    this.render(result.screenshots);
    this.loaded = true;
  }

  private render(items: ScreenshotEntry[]): void {
    this.grid.textContent = '';
    if (items.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = 'Aucune capture. Appuyez sur F2 en jeu pour en créer.';
      this.grid.appendChild(p);
      return;
    }
    for (const item of items) {
      const tile = document.createElement('button');
      tile.className = 'screenshot-tile';
      tile.title = item.name;

      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      img.alt = item.name;

      const meta = document.createElement('div');
      meta.className = 'screenshot-meta';
      meta.textContent = new Date(item.mtime).toLocaleDateString('fr-FR');

      const del = document.createElement('button');
      del.className = 'screenshot-del';
      del.textContent = '×';
      del.title = 'Supprimer';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Supprimer ${item.name} ?`)) return;
        const result = await this.api.deleteScreenshot(item.name);
        this.render(result.screenshots);
      });

      tile.append(img, meta, del);
      tile.addEventListener('click', () => this.openLightbox(item));
      this.grid.appendChild(tile);
    }
  }

  private openLightbox(item: ScreenshotEntry): void {
    const box = $('lightbox');
    const img = $('lightbox-img') as HTMLImageElement;
    const cap = $('lightbox-caption');
    img.src = item.url;
    cap.textContent = `${item.name} — ${new Date(item.mtime).toLocaleString('fr-FR')}`;
    box.classList.add('show');
    box.setAttribute('aria-hidden', 'false');
  }

  private attachLightbox(): void {
    const box = $('lightbox');
    const close = (): void => {
      box.classList.remove('show');
      box.setAttribute('aria-hidden', 'true');
      (($('lightbox-img') as HTMLImageElement)).src = '';
    };
    $('lightbox-close').addEventListener('click', close);
    box.addEventListener('click', (e) => {
      if (e.target === box) close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && box.classList.contains('show')) close();
    });
  }
}
