import type { MinecraftProfile } from '../../../ipc/contract';

const LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

interface LoginResponse {
  access_token?: string;
  expires_in?: number;
}

interface ProfileResponse {
  id?: string;
  name?: string;
}

export interface MinecraftToken {
  accessToken: string;
  expiresAt: number;
}

export class MinecraftAuth {
  async login(userHash: string, xstsToken: string): Promise<MinecraftToken> {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const detail = body ? ` — ${body.slice(0, 300)}` : '';
      throw new Error(`Minecraft a refusé l'authentification (HTTP ${res.status})${detail}`);
    }
    const data = (await res.json()) as LoginResponse;
    if (!data.access_token) {
      throw new Error('Réponse Minecraft invalide (jeton manquant)');
    }
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 86400;
    return { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  }

  async fetchProfile(accessToken: string): Promise<MinecraftProfile> {
    const res = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (res.status === 404) {
      throw new Error('Ce compte ne possède pas Minecraft Java Edition.');
    }
    if (!res.ok) {
      throw new Error(`Profil Minecraft introuvable (HTTP ${res.status})`);
    }
    const data = (await res.json()) as ProfileResponse;
    if (!data.id || !data.name) {
      throw new Error('Profil Minecraft invalide');
    }
    return { id: data.id, name: data.name };
  }
}
