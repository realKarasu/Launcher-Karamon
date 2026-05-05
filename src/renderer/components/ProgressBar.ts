export class ProgressBar {
  static readonly RESET_MS = 1500;

  constructor(private readonly bar: HTMLElement, private readonly label: HTMLElement) {}

  set(val: number): void {
    const pct = Math.round(val * 100);
    this.bar.style.width = pct + '%';
    if (pct <= 0) this.label.textContent = 'Prêt';
    if (pct >= 100) {
      setTimeout(() => {
        this.bar.style.width = '0%';
        this.label.textContent = 'Prêt';
      }, ProgressBar.RESET_MS);
    }
  }
}
