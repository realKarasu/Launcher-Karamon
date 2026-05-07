import type { PingResult } from '../../ipc/contract';

export interface ServerStatusPanelOptions {
  dotEl: HTMLElement;
  textEl: HTMLElement;
  playersEl: HTMLElement;
  tooltipEl?: HTMLElement | null;
  ping: () => Promise<PingResult>;
  onResult?: (result: PingResult, previous: 'online' | 'offline' | 'unknown') => void;
}

export class ServerStatusPanel {
  private readonly dot: HTMLElement;
  private readonly text: HTMLElement;
  private readonly players: HTMLElement;
  private readonly tooltip: HTMLElement | null;
  private readonly ping: () => Promise<PingResult>;
  private readonly onResult?: (
    result: PingResult,
    previous: 'online' | 'offline' | 'unknown',
  ) => void;
  private previous: 'online' | 'offline' | 'unknown' = 'unknown';

  constructor({ dotEl, textEl, playersEl, tooltipEl, ping, onResult }: ServerStatusPanelOptions) {
    this.dot = dotEl;
    this.text = textEl;
    this.players = playersEl;
    this.tooltip = tooltipEl ?? null;
    this.ping = ping;
    this.onResult = onResult;
  }

  async refresh(): Promise<void> {
    const r = await this.ping();
    const prev = this.previous;
    if (r.online) {
      this.dot.className = 'server-status-dot online';
      this.text.textContent = 'En ligne';
      this.setCount(`${r.players} / ${r.maxPlayers}`);
      this.setTooltip(r.sample ?? []);
      this.previous = 'online';
    } else {
      this.dot.className = 'server-status-dot offline';
      this.text.textContent = 'Hors ligne';
      this.setCount('—');
      this.setTooltip([]);
      this.previous = 'offline';
    }
    this.onResult?.(r, prev);
  }

  private setCount(text: string): void {
    if (this.tooltip && this.tooltip.parentElement === this.players) {
      this.players.childNodes.forEach((n) => {
        if (n !== this.tooltip) n.remove();
      });
      this.players.insertBefore(document.createTextNode(text), this.tooltip);
    } else {
      this.players.textContent = text;
    }
  }

  private setTooltip(sample: { name: string }[]): void {
    if (!this.tooltip) return;
    this.tooltip.textContent = '';
    if (sample.length === 0) {
      this.players.classList.remove('has-content');
      return;
    }
    for (const p of sample) {
      const row = document.createElement('div');
      row.className = 'players-tooltip-row';
      row.textContent = p.name;
      this.tooltip.appendChild(row);
    }
    this.players.classList.add('has-content');
  }
}
