import { Client } from '@xhayper/discord-rpc';
import type { ServerPing } from '../server/ServerPing';

const APP_ID = '1501728601760862389';
const LARGE_IMAGE_KEY = 'karamon';
const PING_INTERVAL_MS = 60_000;
const RECONNECT_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;

export type RpcState = 'menu' | 'playing';

export interface DiscordRpcOptions {
  serverHost: string;
  serverPort: number;
  pinger: ServerPing;
  log?: (msg: string) => void;
}

export class DiscordRpc {
  private client: Client | null = null;
  private connected = false;
  private connecting = false;
  private state: RpcState = 'menu';
  private playStartedAt: number | null = null;
  private playerCount: number | null = null;
  private maxPlayers: number | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(private readonly opts: DiscordRpcOptions) {}

  start(): void {
    void this.connect();
    void this.refreshPlayerCount();
    this.retryTimer = setInterval(() => {
      if (!this.connected && !this.destroyed) void this.connect();
    }, RECONNECT_INTERVAL_MS);
    this.pingTimer = setInterval(() => void this.refreshPlayerCount(), PING_INTERVAL_MS);
  }

  setMenu(): void {
    this.state = 'menu';
    this.playStartedAt = null;
    this.push();
  }

  setPlaying(): void {
    this.state = 'playing';
    this.playStartedAt = Date.now();
    void this.refreshPlayerCount();
    this.push();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.connected = false;
  }

  private async connect(): Promise<void> {
    if (this.connected || this.connecting || this.destroyed) return;
    this.connecting = true;
    try {
      this.client = new Client({ clientId: APP_ID });
      this.client.on('ready', () => {
        this.connected = true;
        this.opts.log?.(`[Discord] connecté en tant que ${this.client?.user?.username ?? 'inconnu'}`);
        this.push();
      });
      this.client.on('disconnected', () => {
        this.opts.log?.('[Discord] déconnecté');
        this.connected = false;
      });
      await this.client.login();
    } catch (e) {
      this.opts.log?.(`[Discord] connexion impossible : ${(e as Error).message}`);
      this.connected = false;
      try {
        await this.client?.destroy();
      } catch {
        /* ignore */
      }
      this.client = null;
    } finally {
      this.connecting = false;
    }
  }

  private async refreshPlayerCount(): Promise<void> {
    try {
      const result = await this.opts.pinger.ping(
        this.opts.serverHost,
        this.opts.serverPort,
        PING_TIMEOUT_MS,
      );
      if (result.online) {
        this.playerCount = result.players;
        this.maxPlayers = result.maxPlayers;
      } else {
        this.playerCount = null;
        this.maxPlayers = null;
      }
      this.push();
    } catch {
      /* ignore */
    }
  }

  private playersText(): string {
    if (this.playerCount !== null && this.maxPlayers !== null) {
      const word = this.playerCount === 1 ? 'joueur' : 'joueurs';
      return `${this.playerCount}/${this.maxPlayers} ${word} en ligne`;
    }
    return 'play.karamon.fr';
  }

  private push(): void {
    if (!this.connected || !this.client?.user) return;
    const isPlaying = this.state === 'playing';
    const base = isPlaying
      ? {
          details: 'En jeu sur Karamon',
          state: this.playersText(),
          startTimestamp: this.playStartedAt ?? Date.now(),
          instance: false,
        }
      : {
          details: 'Sur le launcher',
          state: this.playersText(),
          instance: false,
        };
    const activity = {
      ...base,
      largeImageKey: LARGE_IMAGE_KEY,
      largeImageText: 'Karamon — play.karamon.fr',
    };
    this.client.user.setActivity(activity).then(
      () => this.opts.log?.(`[Discord] activité: ${this.state} — ${this.playersText()}`),
      (err: Error) => {
        this.opts.log?.(`[Discord] setActivity échoué (avec image): ${err?.message ?? err}`);
        this.client?.user?.setActivity(base).then(
          () => this.opts.log?.(`[Discord] activité (sans image): ${this.state}`),
          (err2: Error) =>
            this.opts.log?.(`[Discord] setActivity fallback échoué: ${err2?.message ?? err2}`),
        );
      },
    );
  }
}
