import fs from 'fs';
import path from 'path';
import type { PlayStats as PlayStatsData } from '../../../ipc/contract';

const EMPTY: PlayStatsData = {
  totalPlayMs: 0,
  sessions: 0,
  lastPlayedAt: null,
  firstPlayedAt: null,
};

export class PlayStats {
  private readonly file: string;
  private sessionStart: number | null = null;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'stats.json');
  }

  read(): PlayStatsData {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<PlayStatsData>;
      return {
        totalPlayMs: typeof raw.totalPlayMs === 'number' ? raw.totalPlayMs : 0,
        sessions: typeof raw.sessions === 'number' ? raw.sessions : 0,
        lastPlayedAt: typeof raw.lastPlayedAt === 'number' ? raw.lastPlayedAt : null,
        firstPlayedAt: typeof raw.firstPlayedAt === 'number' ? raw.firstPlayedAt : null,
      };
    } catch {
      return { ...EMPTY };
    }
  }

  startSession(): void {
    this.sessionStart = Date.now();
    const stats = this.read();
    if (!stats.firstPlayedAt) stats.firstPlayedAt = this.sessionStart;
    stats.lastPlayedAt = this.sessionStart;
    stats.sessions = stats.sessions + 1;
    this.write(stats);
  }

  endSession(): PlayStatsData {
    if (!this.sessionStart) return this.read();
    const stats = this.read();
    stats.totalPlayMs += Date.now() - this.sessionStart;
    this.sessionStart = null;
    this.write(stats);
    return stats;
  }

  reset(): PlayStatsData {
    this.write({ ...EMPTY });
    return { ...EMPTY };
  }

  private write(data: PlayStatsData): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(data), 'utf8');
    } catch {
      /* best-effort */
    }
  }
}
