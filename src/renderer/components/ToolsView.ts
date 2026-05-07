import type { BackupEntry, CrashReport, LauncherApi } from '../../ipc/contract';
import { $ } from '../util/dom';

export class ToolsView {
  private readonly api: LauncherApi;
  private readonly crashList: HTMLElement;
  private readonly backupList: HTMLElement;
  private loaded = false;

  constructor(api: LauncherApi) {
    this.api = api;
    this.crashList = $('crash-list');
    this.backupList = $('backup-list');
    this.attachModal();
    $('btn-backup-now').addEventListener('click', () => this.createBackup());
  }

  invalidate(): void {
    this.loaded = false;
  }

  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    await Promise.all([this.refreshCrashes(), this.refreshBackups()]);
    this.loaded = true;
  }

  private async refreshCrashes(): Promise<void> {
    const result = await this.api.listCrashes();
    this.renderCrashes(result.reports);
  }

  private async refreshBackups(): Promise<void> {
    const result = await this.api.listBackups();
    this.renderBackups(result.backups);
  }

  private renderCrashes(reports: CrashReport[]): void {
    this.crashList.textContent = '';
    if (reports.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = 'Aucun crash détecté. 🎉';
      this.crashList.appendChild(p);
      return;
    }
    for (const r of reports) {
      const row = document.createElement('div');
      row.className = 'crash-row';

      const main = document.createElement('div');
      main.className = 'crash-main';
      const tag = document.createElement('span');
      tag.className = 'crash-tag';
      tag.textContent = r.summary;
      const meta = document.createElement('span');
      meta.className = 'crash-meta';
      meta.textContent = `${r.name} — ${new Date(r.mtime).toLocaleString('fr-FR')}`;
      main.append(tag, meta);

      const view = document.createElement('button');
      view.className = 'btn-ghost btn-mini';
      view.textContent = 'Voir';
      view.addEventListener('click', () => this.openCrash(r));

      const del = document.createElement('button');
      del.className = 'btn-ghost btn-mini';
      del.textContent = 'Suppr.';
      del.addEventListener('click', async () => {
        if (!confirm(`Supprimer ${r.name} ?`)) return;
        const result = await this.api.deleteCrash(r.name);
        this.renderCrashes(result.reports);
      });

      row.append(main, view, del);
      this.crashList.appendChild(row);
    }
  }

  private renderBackups(backups: BackupEntry[]): void {
    this.backupList.textContent = '';
    if (backups.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = 'Aucune sauvegarde. Cliquez sur Sauvegarder pour en créer.';
      this.backupList.appendChild(p);
      return;
    }
    for (const b of backups) {
      const row = document.createElement('div');
      row.className = 'backup-row';

      const main = document.createElement('div');
      main.className = 'backup-main';
      const name = document.createElement('span');
      name.className = 'backup-name';
      name.textContent = b.name;
      const meta = document.createElement('span');
      meta.className = 'backup-meta';
      meta.textContent = `${ToolsView.formatSize(b.size)} — ${new Date(b.mtime).toLocaleString('fr-FR')}`;
      main.append(name, meta);

      const del = document.createElement('button');
      del.className = 'btn-ghost btn-mini';
      del.textContent = 'Suppr.';
      del.addEventListener('click', async () => {
        if (!confirm(`Supprimer ${b.name} ?`)) return;
        const result = await this.api.deleteBackup(b.name);
        this.renderBackups(result.backups);
      });

      row.append(main, del);
      this.backupList.appendChild(row);
    }
  }

  private async createBackup(): Promise<void> {
    const btn = $('btn-backup-now') as HTMLButtonElement;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Sauvegarde…';
    try {
      await this.api.createBackup();
      await this.refreshBackups();
    } catch (e) {
      alert('Erreur: ' + (e as Error).message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  private async openCrash(r: CrashReport): Promise<void> {
    const content = await this.api.readCrash(r.name);
    ($('crash-modal-title')).textContent = `${r.name} — ${r.summary}`;
    ($('crash-modal-body')).textContent = content;
    $('crash-modal').classList.add('show');
  }

  private attachModal(): void {
    const modal = $('crash-modal');
    const close = (): void => {
      modal.classList.remove('show');
      ($('crash-modal-body')).textContent = '';
    };
    $('crash-modal-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) close();
    });
  }

  private static formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
