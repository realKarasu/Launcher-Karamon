const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';

interface XboxResponse {
  Token?: string;
  DisplayClaims?: { xui?: { uhs?: string }[] };
}

interface XstsErrorBody {
  XErr?: number;
  Message?: string;
}

export interface XboxToken {
  token: string;
  userHash: string;
}

export class XboxAuth {
  async authenticate(microsoftAccessToken: string): Promise<XboxToken> {
    const xbl = await this.xboxLive(microsoftAccessToken);
    const xsts = await this.xsts(xbl.token);
    return { token: xsts.token, userHash: xsts.userHash };
  }

  private async xboxLive(msAccessToken: string): Promise<XboxToken> {
    const res = await fetch(XBL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${msAccessToken}`,
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      }),
    });
    if (!res.ok) {
      throw new Error(`Xbox Live a refusé l'authentification (HTTP ${res.status})`);
    }
    return this.parseXboxResponse((await res.json()) as XboxResponse);
  }

  private async xsts(xblToken: string): Promise<XboxToken> {
    const res = await fetch(XSTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      }),
    });
    if (res.status === 401) {
      const body = (await res.json().catch(() => ({}))) as XstsErrorBody;
      throw new Error(this.translateXstsError(body));
    }
    if (!res.ok) {
      throw new Error(`XSTS a échoué (HTTP ${res.status})`);
    }
    return this.parseXboxResponse((await res.json()) as XboxResponse);
  }

  private parseXboxResponse(data: XboxResponse): XboxToken {
    const token = data.Token;
    const userHash = data.DisplayClaims?.xui?.[0]?.uhs;
    if (!token || !userHash) {
      throw new Error('Réponse Xbox invalide');
    }
    return { token, userHash };
  }

  private translateXstsError(body: XstsErrorBody): string {
    switch (body.XErr) {
      case 2148916233:
        return "Ce compte Microsoft n'a pas de profil Xbox. Connectez-vous une fois sur xbox.com pour en créer un.";
      case 2148916235:
        return "Xbox Live n'est pas disponible dans votre pays/région.";
      case 2148916236:
      case 2148916237:
        return "Vérification d'âge requise sur le compte adulte associé.";
      case 2148916238:
        return 'Compte mineur — il doit être ajouté à une famille par un adulte.';
      default:
        return `XSTS a refusé l'authentification (XErr=${body.XErr ?? 'inconnu'})`;
    }
  }
}
