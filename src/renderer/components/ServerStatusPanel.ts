import type { PingResult } from '../../ipc/contract';

export interface ServerStatusPanelOptions {
  dotEl: HTMLElement;
  textEl: HTMLElement;
  playersEl: HTMLElement;
  ping: () => Promise<PingResult>;
}

export class ServerStatusPanel {
  private readonly dot: HTMLElement;
  private readonly text: HTMLElement;
  private readonly players: HTMLElement;
  private readonly ping: () => Promise<PingResult>;

  constructor({ dotEl, textEl, playersEl, ping }: ServerStatusPanelOptions) {
    this.dot = dotEl;
    this.text = textEl;
    this.players = playersEl;
    this.ping = ping;
  }

  async refresh(): Promise<void> {
    const r = await this.ping();
    if (r.online) {
      this.dot.className = 'server-status-dot online';
      this.text.textContent = 'En ligne';
      this.players.textContent = `${r.players} / ${r.maxPlayers}`;
    } else {
      this.dot.className = 'server-status-dot offline';
      this.text.textContent = 'Hors ligne';
      this.players.textContent = '—';
    }
  }
}
