import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron/main';
import type { MinecraftProfile } from '../../../ipc/contract';

interface StoredSession {
  refreshTokenEnc: string;
  profile: MinecraftProfile;
  savedAt: number;
}

export interface LoadedSession {
  refreshToken: string;
  profile: MinecraftProfile;
}

export class TokenStore {
  constructor(private readonly file: string) {}

  save(refreshToken: string, profile: MinecraftProfile): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Stockage chiffré indisponible sur ce système');
    }
    const encrypted = safeStorage.encryptString(refreshToken).toString('base64');
    const data: StoredSession = { refreshTokenEnc: encrypted, profile, savedAt: Date.now() };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  load(): LoadedSession | null {
    if (!fs.existsSync(this.file)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoredSession;
      if (!raw?.refreshTokenEnc || !raw?.profile?.id || !raw?.profile?.name) return null;
      const refreshToken = safeStorage.decryptString(Buffer.from(raw.refreshTokenEnc, 'base64'));
      return { refreshToken, profile: raw.profile };
    } catch {
      return null;
    }
  }

  clear(): void {
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
  }
}
