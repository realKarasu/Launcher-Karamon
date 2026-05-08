import type { MinecraftProfile } from '../../../ipc/contract';
import { MicrosoftAuth, type MicrosoftToken } from './MicrosoftAuth';
import { XboxAuth } from './XboxAuth';
import { MinecraftAuth, type MinecraftToken } from './MinecraftAuth';
import { TokenStore } from './TokenStore';

const REFRESH_LEEWAY_MS = 60_000;

export interface ActiveSession {
  profile: MinecraftProfile;
  accessToken: string;
  expiresAt: number;
}

export class AuthSession {
  private current: ActiveSession | null = null;

  constructor(
    private readonly store: TokenStore,
    private readonly microsoft: MicrosoftAuth = new MicrosoftAuth(),
    private readonly xbox: XboxAuth = new XboxAuth(),
    private readonly minecraft: MinecraftAuth = new MinecraftAuth(),
  ) {}

  cachedProfile(): MinecraftProfile | null {
    if (this.current) return this.current.profile;
    return this.store.load()?.profile ?? null;
  }

  hasStoredSession(): boolean {
    return this.store.load() !== null;
  }

  async login(): Promise<MinecraftProfile> {
    const ms = await this.microsoft.login();
    return (await this.completeChain(ms)).profile;
  }

  async refresh(): Promise<ActiveSession> {
    const stored = this.store.load();
    if (!stored) throw new Error('Aucune session stockée — connexion requise');
    const ms = await this.microsoft.refresh(stored.refreshToken);
    return await this.completeChain(ms);
  }

  async getActive(): Promise<ActiveSession> {
    if (this.current && this.current.expiresAt > Date.now() + REFRESH_LEEWAY_MS) {
      return this.current;
    }
    return await this.refresh();
  }

  logout(): void {
    this.store.clear();
    this.current = null;
  }

  private async completeChain(ms: MicrosoftToken): Promise<ActiveSession> {
    const xbox = await this.xbox.authenticate(ms.accessToken);
    const mc: MinecraftToken = await this.minecraft.login(xbox.userHash, xbox.token);
    const profile = await this.minecraft.fetchProfile(mc.accessToken);
    this.store.save(ms.refreshToken, profile);
    this.current = { profile, accessToken: mc.accessToken, expiresAt: mc.expiresAt };
    return this.current;
  }
}
