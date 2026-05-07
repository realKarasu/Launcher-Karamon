import type { LauncherApi } from '../../ipc/contract';

export interface QuickLink {
  label: string;
  url: string;
  icon: string;
}

const LINKS: QuickLink[] = [
  {
    label: 'Site',
    url: 'https://karamon.fr',
    icon: '<path d="M10 2a8 8 0 100 16 8 8 0 000-16z M2 10h16 M10 2c2.5 2.5 4 5.5 4 8s-1.5 5.5-4 8 M10 2c-2.5 2.5-4 5.5-4 8s1.5 5.5 4 8"/>',
  },
  {
    label: 'Discord',
    url: 'https://discord.gg/karavr',
    icon: '<path d="M6 7c1-1 3-1.5 4-1.5S13 6 14 7 M5 14c1.5 1 3 1.5 5 1.5s3.5-.5 5-1.5 M3 6l1-2h12l1 2 1 6-2 4-3-1-1-2 1-1-2-1-2 1-2-1-2 1 1 1-1 2-3 1-2-4z" stroke-linejoin="round"/>',
  },
];

export class QuickLinks {
  static render(api: LauncherApi, container: HTMLElement): void {
    container.textContent = '';
    for (const link of LINKS) {
      const btn = document.createElement('button');
      btn.className = 'nav-link';
      btn.title = link.url;
      btn.innerHTML = `<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${link.icon}</svg><span>${link.label}</span>`;
      btn.addEventListener('click', () => {
        void api.openExternal(link.url);
      });
      container.appendChild(btn);
    }
  }
}
