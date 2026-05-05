export type ToastType = 'ok' | 'error' | 'info' | 'warn' | '';

export class Toast {
  static readonly FADE_MS = 300;
  static readonly DURATION_MS = 3000;

  static show(msg: string, type: ToastType = ''): void {
    const container = Toast.container();
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = msg;
    container.appendChild(el);

    setTimeout(() => {
      el.style.transition = `opacity ${Toast.FADE_MS}ms ease, transform ${Toast.FADE_MS}ms ease`;
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), Toast.FADE_MS);
    }, Toast.DURATION_MS);
  }

  private static container(): HTMLElement {
    let c = document.querySelector<HTMLElement>('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }
}
