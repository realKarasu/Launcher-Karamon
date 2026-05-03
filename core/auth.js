const fs = require('fs');
const path = require('path');
const dl = require('./downloader');
const paths = require('./paths');

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL       = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE           = 'XboxLive.signin offline_access';

// ── Cache I/O ────────────────────────────────────────────────────────────────

function loadCache() {
  try {
    if (fs.existsSync(paths.authCache)) return JSON.parse(fs.readFileSync(paths.authCache, 'utf8'));
  } catch (_) {}
  return {};
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(paths.authCache), { recursive: true });
  fs.writeFileSync(paths.authCache, JSON.stringify(cache, null, 2), 'utf8');
}

function clearCache() {
  try { fs.unlinkSync(paths.authCache); } catch (_) {}
}

function cachedAccountName() {
  const c = loadCache();
  return c.profileName || null;
}

// ── Microsoft OAuth ──────────────────────────────────────────────────────────

async function refreshMicrosoft(clientId, refreshToken) {
  const res = await dl.postForm(TOKEN_URL, {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });
  if (res.status < 200 || res.status >= 300) throw new Error('Refresh Microsoft échoué: ' + res.body);
  const data = JSON.parse(res.body);
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function deviceCodeFlow(clientId, onCode) {
  const res = await dl.postForm(DEVICE_CODE_URL, { client_id: clientId, scope: SCOPE });
  if (res.status < 200 || res.status >= 300) throw new Error('Impossible d\'obtenir le device code: ' + res.body);
  const device = JSON.parse(res.body);
  const { device_code, user_code, verification_uri, expires_in } = device;
  let interval = Math.max(3, device.interval || 5);

  onCode({ userCode: user_code, verificationUri: verification_uri });
  try { require('electron').shell.openExternal(verification_uri); } catch (_) {}

  const deadline = Date.now() + expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const tokenRes = await dl.postForm(TOKEN_URL, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code,
    });
    const token = JSON.parse(tokenRes.body);
    if (tokenRes.status >= 200 && tokenRes.status < 300) {
      return { accessToken: token.access_token, refreshToken: token.refresh_token };
    }
    if (token.error === 'authorization_pending') continue;
    if (token.error === 'slow_down') { interval += 5; continue; }
    if (token.error === 'authorization_declined') throw new Error('Connexion Microsoft refusée.');
    if (token.error === 'expired_token') throw new Error('Code expiré, relance la connexion.');
    throw new Error('Erreur OAuth: ' + tokenRes.body);
  }
  throw new Error('Code Microsoft expiré.');
}

// ── Xbox / Minecraft auth ────────────────────────────────────────────────────

async function authXboxLive(msAccessToken) {
  const res = await dl.postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  if (res.status < 200 || res.status >= 300) throw new Error('Xbox Live auth échouée: ' + res.body);
  return parseXboxToken(JSON.parse(res.body));
}

async function authXsts(xblToken) {
  const res = await dl.postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  });
  if (res.status < 200 || res.status >= 300) {
    let msg = 'Erreur XSTS';
    try {
      const xerr = JSON.parse(res.body).XErr;
      if (xerr === 2148916233) msg = 'Ce compte n\'a pas de profil Xbox Live.';
      else if (xerr === 2148916235) msg = 'Xbox Live n\'est pas disponible dans cette région.';
      else if (xerr === 2148916238) msg = 'Compte enfant: un adulte doit autoriser Xbox Live.';
    } catch (_) {}
    throw new Error(msg);
  }
  return parseXboxToken(JSON.parse(res.body));
}

async function loginMinecraft(userHash, xstsToken) {
  const res = await dl.postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
  });
  if (res.status < 200 || res.status >= 300) throw new Error('Login Minecraft échoué: ' + res.body);
  const data = JSON.parse(res.body);
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
  };
}

async function verifyOwnership(accessToken) {
  const res = await dl.getWithAuth('https://api.minecraftservices.com/entitlements/mcstore', accessToken);
  if (res.status < 200 || res.status >= 300) throw new Error('Vérification de propriété échouée: ' + res.body);
  const items = JSON.parse(res.body).items || [];
  const owns = items.some((i) => i.name && i.name.toLowerCase().includes('minecraft'));
  if (!owns) throw new Error('Ce compte ne possède pas Minecraft Java Edition.');
}

async function fetchProfile(accessToken) {
  const res = await dl.getWithAuth('https://api.minecraftservices.com/minecraft/profile', accessToken);
  if (res.status === 404) throw new Error('Aucun profil Minecraft trouvé sur ce compte.');
  if (res.status < 200 || res.status >= 300) throw new Error('Profil Minecraft inaccessible: ' + res.body);
  const data = JSON.parse(res.body);
  return { id: data.id, name: data.name };
}

function parseXboxToken(data) {
  const xui = data.DisplayClaims?.xui?.[0] || {};
  return { token: data.Token, userHash: xui.uhs || '', xuid: xui.xid || '' };
}

// ── Full auth flow ────────────────────────────────────────────────────────────

async function completeLogin(msAccessToken, msRefreshToken, clientId, checkOwnership) {
  const xbl  = await authXboxLive(msAccessToken);
  const xsts = await authXsts(xbl.token);
  const mc   = await loginMinecraft(xsts.userHash, xsts.token);
  if (checkOwnership) await verifyOwnership(mc.accessToken);
  const profile = await fetchProfile(mc.accessToken);
  return { mc, profile, xuid: xsts.xuid, msRefreshToken };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function ensureAuthenticated(clientId, checkOwnership, onStatus, onCode) {
  const cache = loadCache();

  if (cache.mcAccessToken && cache.mcExpiresAt && Date.now() < cache.mcExpiresAt) {
    if (checkOwnership) {
      onStatus('Vérification de la propriété...');
      await verifyOwnership(cache.mcAccessToken);
    }
    onStatus('Compte connecté: ' + cache.profileName);
    return buildSession(cache);
  }

  if (cache.msRefreshToken) {
    try {
      onStatus('Renouvellement de la session Microsoft...');
      const ms = await refreshMicrosoft(clientId, cache.msRefreshToken);
      const { mc, profile, xuid } = await completeLogin(ms.accessToken, ms.refreshToken, clientId, checkOwnership);
      const newCache = {
        msRefreshToken: ms.refreshToken,
        mcAccessToken: mc.accessToken,
        mcExpiresAt: mc.expiresAt,
        profileName: profile.name,
        uuid: profile.id,
        xuid,
      };
      saveCache(newCache);
      onStatus('Compte connecté: ' + profile.name);
      return buildSession(newCache);
    } catch (e) {
      onStatus('Session expirée, nouvelle connexion requise...');
    }
  }

  onStatus('Démarrage du flux de connexion Microsoft...');
  const ms = await deviceCodeFlow(clientId, onCode);
  const { mc, profile, xuid } = await completeLogin(ms.accessToken, ms.refreshToken, clientId, checkOwnership);
  const newCache = {
    msRefreshToken: ms.refreshToken,
    mcAccessToken: mc.accessToken,
    mcExpiresAt: mc.expiresAt,
    profileName: profile.name,
    uuid: profile.id,
    xuid,
  };
  saveCache(newCache);
  onStatus('Compte connecté: ' + profile.name);
  return buildSession(newCache);
}

function buildSession(cache) {
  return {
    accessToken: cache.mcAccessToken,
    uuid: cache.uuid,
    profileName: cache.profileName,
    xuid: cache.xuid || '',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { ensureAuthenticated, cachedAccountName, clearCache };
