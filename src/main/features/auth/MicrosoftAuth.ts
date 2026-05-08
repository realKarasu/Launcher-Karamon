import { BrowserWindow } from 'electron/main';
import crypto from 'crypto';

const CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'XboxLive.signin offline_access';
const AUTH_URL = 'https://login.live.com/oauth20_authorize.srf';
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface MicrosoftToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class MicrosoftAuth {
  async login(): Promise<MicrosoftToken> {
    const state = crypto.randomBytes(16).toString('hex');
    const code = await this.runBrowserFlow(this.buildAuthorizeUrl(state), state);
    return await this.exchangeCodeForToken(code);
  }

  async refresh(refreshToken: string): Promise<MicrosoftToken> {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Microsoft a refusé le rafraîchissement (HTTP ${res.status})`);
    }
    return this.parseTokenResponse((await res.json()) as TokenResponse);
  }

  private buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      response_mode: 'query',
      scope: SCOPE,
      state,
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  private async exchangeCodeForToken(code: string): Promise<MicrosoftToken> {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Microsoft a refusé le code (HTTP ${res.status})`);
    }
    return this.parseTokenResponse((await res.json()) as TokenResponse);
  }

  private parseTokenResponse(data: TokenResponse): MicrosoftToken {
    if (!data.access_token || !data.refresh_token) {
      throw new Error('Réponse Microsoft invalide (jetons manquants)');
    }
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  private runBrowserFlow(authorizeUrl: string, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;

      const win = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Karamon — Connexion Microsoft',
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0a',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'karamon-msauth',
        },
      });

      const finish = (err: Error | null, code: string | null): void => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (!win.isDestroyed()) win.close();
        if (err) reject(err);
        else resolve(code as string);
      };

      const tryHandleCallback = (rawUrl: string): boolean => {
        if (!rawUrl.startsWith(REDIRECT_URI)) return false;
        let parsed: URL;
        try {
          parsed = new URL(rawUrl);
        } catch {
          return false;
        }
        const error = parsed.searchParams.get('error');
        if (error) {
          const desc = parsed.searchParams.get('error_description') ?? error;
          finish(new Error(`Microsoft: ${desc}`), null);
          return true;
        }
        if (parsed.searchParams.get('state') !== expectedState) {
          finish(new Error('État OAuth invalide'), null);
          return true;
        }
        const code = parsed.searchParams.get('code');
        if (!code) {
          finish(new Error('Code manquant dans la réponse'), null);
          return true;
        }
        finish(null, code);
        return true;
      };

      win.webContents.on('will-redirect', (event, url) => {
        if (tryHandleCallback(url)) event.preventDefault();
      });
      win.webContents.on('will-navigate', (event, url) => {
        if (tryHandleCallback(url)) event.preventDefault();
      });

      win.on('closed', () => {
        if (!settled) {
          settled = true;
          if (timeout) clearTimeout(timeout);
          reject(new Error('Connexion annulée'));
        }
      });

      timeout = setTimeout(
        () => finish(new Error('Délai de connexion dépassé (5 min)'), null),
        LOGIN_TIMEOUT_MS,
      );

      win.loadURL(authorizeUrl).catch((err: Error) =>
        finish(new Error('Impossible de charger la page Microsoft: ' + err.message), null),
      );
    });
  }
}
