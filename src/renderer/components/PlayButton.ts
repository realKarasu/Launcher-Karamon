export class PlayButton {
  private readonly icon: HTMLElement;

  constructor(private readonly btn: HTMLElement, private readonly label: HTMLElement) {
    const icon = btn.querySelector<HTMLElement>('.play-btn-icon');
    if (!icon) throw new Error('PlayButton: .play-btn-icon introuvable');
    this.icon = icon;
  }

  setIdle(): void {
    this.apply('play-btn', 'JOUER', '1');
  }

  setLoading(): void {
    this.apply('play-btn loading', 'CHARGEMENT…', '0.5');
  }

  setRunning(): void {
    this.apply('play-btn running', 'EN JEU', '1');
  }

  private apply(className: string, label: string, opacity: string): void {
    this.btn.className = className;
    this.label.textContent = label;
    this.icon.style.opacity = opacity;
  }
}
