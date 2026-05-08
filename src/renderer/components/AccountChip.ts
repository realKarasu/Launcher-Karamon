import type { MinecraftProfile } from '../../ipc/contract';

export class AccountChip {
  constructor(
    private readonly root: HTMLElement,
    private readonly onLogoutClick: () => void,
  ) {
    this.root.addEventListener('click', () => this.onLogoutClick());
  }

  render(profile: MinecraftProfile | null): void {
    if (!profile) {
      this.root.style.display = 'none';
      this.root.classList.remove('signed-in');
      return;
    }
    this.root.style.display = '';
    this.root.classList.add('signed-in');
    this.root.title = `${profile.name} — cliquer pour se déconnecter`;
    const avatarUrl = `https://crafatar.com/avatars/${profile.id}?size=48&overlay`;
    this.root.innerHTML = `
      <span class="chip-avatar">
        <img src="${avatarUrl}" alt="" onerror="this.style.display='none'" />
      </span>
      <span class="chip-label">${AccountChip.escape(profile.name)}</span>`;
  }

  private static escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }
}
