export class PlayersSparkline {
  static readonly MAX_POINTS = 30;
  static readonly W = 80;
  static readonly H = 24;

  private readonly path: SVGPathElement;
  private readonly history: number[] = [];

  constructor(path: SVGPathElement) {
    this.path = path;
  }

  push(value: number | null): void {
    this.history.push(value ?? 0);
    if (this.history.length > PlayersSparkline.MAX_POINTS) this.history.shift();
    this.render();
  }

  private render(): void {
    if (this.history.length < 2) {
      this.path.setAttribute('d', '');
      return;
    }
    const max = Math.max(1, ...this.history);
    const w = PlayersSparkline.W;
    const h = PlayersSparkline.H;
    const step = w / (PlayersSparkline.MAX_POINTS - 1);
    const offsetX = (PlayersSparkline.MAX_POINTS - this.history.length) * step;
    const points = this.history.map((v, i) => {
      const x = offsetX + i * step;
      const y = h - 2 - (v / max) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    this.path.setAttribute('d', `M${points.join(' L')}`);
  }
}
