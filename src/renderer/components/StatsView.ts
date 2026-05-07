import type { LauncherApi, PlayStats } from '../../ipc/contract';
import { $opt } from '../util/dom';

export class StatsView {
  private readonly api: LauncherApi;

  constructor(api: LauncherApi) {
    this.api = api;
  }

  async refresh(): Promise<void> {
    const stats = await this.api.getStats();
    this.render(stats);
  }

  async reset(): Promise<void> {
    const stats = await this.api.resetStats();
    this.render(stats);
  }

  private render(stats: PlayStats): void {
    const playtime = StatsView.formatDuration(stats.totalPlayMs);
    const sessions = String(stats.sessions);
    const last = StatsView.formatRelative(stats.lastPlayedAt);
    const first = StatsView.formatDate(stats.firstPlayedAt);

    StatsView.set('stat-playtime', playtime);
    StatsView.set('stat-sessions', sessions);
    StatsView.set('stat-last', last);
    StatsView.set('cfg-stat-playtime', playtime);
    StatsView.set('cfg-stat-sessions', sessions);
    StatsView.set('cfg-stat-first', first);
  }

  private static set(id: string, value: string): void {
    const el = $opt(id);
    if (el) el.textContent = value;
  }

  private static formatDuration(ms: number): string {
    if (!ms) return '0 min';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} min`;
    return `${h}h ${m.toString().padStart(2, '0')}`;
  }

  private static formatRelative(ts: number | null): string {
    if (!ts) return 'Jamais';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "À l'instant";
    if (min < 60) return `Il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `Il y a ${d}j`;
    return new Date(ts).toLocaleDateString('fr-FR');
  }

  private static formatDate(ts: number | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('fr-FR');
  }
}
