import { Client } from '@xhayper/discord-rpc';

const APP_ID = '1501728601760862389';
const LARGE_IMAGE_KEY = 'karamon';

export type RpcState = 'menu' | 'playing';

export class DiscordRpc {
  private client: Client | null = null;
  private connected = false;
  private connecting = false;
  private state: RpcState = 'menu';
  private playStartedAt: number | null = null;

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    try {
      this.client = new Client({ clientId: APP_ID });
      this.client.on('ready', () => {
        this.connected = true;
        console.log('[DiscordRpc] connected as', this.client?.user?.username);
        this.push();
      });
      this.client.on('disconnected', () => {
        console.log('[DiscordRpc] disconnected');
        this.connected = false;
      });
      await this.client.login();
    } catch (e) {
      console.warn('[DiscordRpc] login failed:', (e as Error).message);
      this.connected = false;
      this.client = null;
    } finally {
      this.connecting = false;
    }
  }

  setMenu(): void {
    this.state = 'menu';
    this.playStartedAt = null;
    this.push();
  }

  setPlaying(): void {
    this.state = 'playing';
    this.playStartedAt = Date.now();
    this.push();
  }

  async destroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch {
      // ignore
    }
    this.client = null;
    this.connected = false;
  }

  private push(): void {
    if (!this.connected || !this.client?.user) return;
    const base =
      this.state === 'playing'
        ? {
            details: 'Joue sur Karamon',
            state: 'play.karamon.fr',
            startTimestamp: this.playStartedAt ?? Date.now(),
            instance: false,
          }
        : {
            details: 'Sur le launcher',
            state: 'En attente…',
            instance: false,
          };
    const activity = {
      ...base,
      largeImageKey: LARGE_IMAGE_KEY,
      largeImageText: 'Karamon — Cobblemon',
    };
    this.client.user.setActivity(activity).then(
      () => console.log('[DiscordRpc] activity set:', this.state),
      (err) => {
        console.warn('[DiscordRpc] setActivity with image failed:', err?.message ?? err);
        this.client?.user
          ?.setActivity(base)
          .then(
            () => console.log('[DiscordRpc] activity set (no image):', this.state),
            (err2) =>
              console.warn('[DiscordRpc] setActivity fallback failed:', err2?.message ?? err2),
          );
      },
    );
  }
}
