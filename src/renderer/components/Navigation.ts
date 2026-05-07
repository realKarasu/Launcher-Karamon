import { $ } from '../util/dom';

export class Navigation {
  static attach(onChange?: (panel: string) => void): void {
    document.querySelectorAll<HTMLElement>('.nav-btn[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = btn.dataset.panel;
        if (panel) {
          $('panel-' + panel).classList.add('active');
          onChange?.(panel);
        }
      });
    });
  }
}
