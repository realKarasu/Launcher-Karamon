export type LogType = 'ok' | 'error' | 'info' | 'warn' | 'mc' | '';

export interface ConsoleViewOptions {
  linesEl: HTMLElement;
  wrapEl: HTMLElement;
  progressLabel: HTMLElement;
}

export class ConsoleView {
  static readonly MAX_LINES = 500;
  static readonly SHORT_LABEL_LIMIT = 80;

  private readonly linesEl: HTMLElement;
  private readonly wrapEl: HTMLElement;
  private readonly progressLabel: HTMLElement;
  private readonly logs: string[] = [];
  private open = false;

  constructor({ linesEl, wrapEl, progressLabel }: ConsoleViewOptions) {
    this.linesEl = linesEl;
    this.wrapEl = wrapEl;
    this.progressLabel = progressLabel;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.wrapEl.classList.toggle('open', open);
  }

  log(msg: string, type: LogType = ''): void {
    const ts = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const line = `[${ts}] ${msg}`;
    this.logs.push(line);

    const cls = ['log-line', type ? 'log-' + type : ConsoleView.infer(msg)]
      .filter(Boolean)
      .join(' ');
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = line;
    this.linesEl.appendChild(el);

    while (this.linesEl.children.length > ConsoleView.MAX_LINES) {
      this.linesEl.removeChild(this.linesEl.firstChild!);
    }
    this.linesEl.scrollTop = this.linesEl.scrollHeight;

    if (!msg.startsWith('[MC]')) {
      this.progressLabel.textContent =
        msg.length > ConsoleView.SHORT_LABEL_LIMIT
          ? msg.slice(0, ConsoleView.SHORT_LABEL_LIMIT) + '…'
          : msg;
    }
  }

  clear(): void {
    this.linesEl.innerHTML = '';
    this.logs.length = 0;
    this.log('Console effacée.', 'info');
  }

  joined(): string {
    return this.logs.join('\n');
  }

  private static infer(msg: string): string {
    if (/error|erreur|échec/i.test(msg)) return 'log-error';
    if (/warn|avertissement/i.test(msg)) return 'log-warn';
    if (/ok|terminé|connecté|synchronis/i.test(msg)) return 'log-ok';
    if (msg.startsWith('[MC]')) return 'log-mc';
    return '';
  }
}
