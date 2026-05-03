package fr.karamon.launcher.auth;

import fr.karamon.launcher.config.LauncherConfig;
import fr.karamon.launcher.util.Http;
import fr.karamon.launcher.util.Json;
import fr.karamon.launcher.util.ProgressListener;

import java.awt.Desktop;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MinecraftAuthService {
    private static final String DEVICE_CODE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
    private static final String TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
    private static final String SCOPE = "XboxLive.signin offline_access";

    private final Path cachePath;
    private final LauncherConfig config;
    private final ProgressListener listener;

    public MinecraftAuthService(Path cachePath, LauncherConfig config, ProgressListener listener) {
        this.cachePath = cachePath;
        this.config = config;
        this.listener = listener;
    }

    public AuthSession ensureAuthenticated() throws Exception {
        requireClientId();
        AuthCache cache = AuthCache.load(cachePath);
        if (cache.hasUsableMinecraftToken()) {
            AuthSession session = cache.toSession();
            if (config.checkOwnershipEveryLaunch()) {
                verifyOwnership(session.accessToken());
            }
            listener.status("Compte verifie: " + session.profileName());
            return session;
        }

        if (cache.hasRefreshToken()) {
            try {
                listener.status("Renouvellement de la session Microsoft...");
                TokenResult refreshed = refreshMicrosoft(cache.microsoftRefreshToken());
                AuthSession session = completeMinecraftLogin(refreshed.accessToken(), refreshed.refreshToken(), cache);
                cache.save(cachePath);
                listener.status("Compte verifie: " + session.profileName());
                return session;
            } catch (Exception e) {
                listener.status("Session expiree, nouvelle connexion requise.");
            }
        }

        TokenResult microsoft = runDeviceCodeFlow();
        AuthCache fresh = new AuthCache();
        AuthSession session = completeMinecraftLogin(microsoft.accessToken(), microsoft.refreshToken(), fresh);
        fresh.save(cachePath);
        listener.status("Compte connecte: " + session.profileName());
        return session;
    }

    public String cachedAccountLabel() {
        try {
            AuthCache cache = AuthCache.load(cachePath);
            if (cache.profileName() != null && !cache.profileName().isBlank()) {
                return cache.profileName();
            }
        } catch (IOException ignored) {
        }
        return "Non connecte";
    }

    public void logout() throws IOException {
        Files.deleteIfExists(cachePath);
    }

    private void requireClientId() {
        if (!config.hasMicrosoftClientId()) {
            throw new IllegalStateException("Ajoute un microsoftClientId valide dans config/launcher.json avant la connexion Microsoft.");
        }
    }

    private TokenResult runDeviceCodeFlow() throws Exception {
        listener.status("Demande d'un code Microsoft...");
        Http.HttpResult deviceResponse = Http.postForm(DEVICE_CODE_URL, Map.of(
                "client_id", config.microsoftClientId(),
                "scope", SCOPE
        ));
        deviceResponse.requireSuccess("device code Microsoft");
        Map<String, Object> device = Json.parseObject(deviceResponse.body());
        String deviceCode = Json.str(device, "device_code", "");
        String userCode = Json.str(device, "user_code", "");
        String verificationUri = Json.str(device, "verification_uri", "https://www.microsoft.com/link");
        int interval = Math.max(3, Json.integer(device, "interval", 5));
        int expiresIn = Json.integer(device, "expires_in", 900);

        listener.status("Ouvre " + verificationUri + " et entre le code " + userCode);
        openBrowser(verificationUri);

        long end = System.currentTimeMillis() + expiresIn * 1000L;
        while (System.currentTimeMillis() < end) {
            Thread.sleep(interval * 1000L);
            Http.HttpResult tokenResponse = Http.postForm(TOKEN_URL, Map.of(
                    "grant_type", "urn:ietf:params:oauth:grant-type:device_code",
                    "client_id", config.microsoftClientId(),
                    "device_code", deviceCode
            ));
            Map<String, Object> token = Json.parseObject(tokenResponse.body());
            if (tokenResponse.statusCode() >= 200 && tokenResponse.statusCode() < 300) {
                return tokenResult(token);
            }
            String error = Json.str(token, "error", "");
            if ("authorization_pending".equals(error)) {
                listener.status("En attente de validation Microsoft... code " + userCode);
                continue;
            }
            if ("slow_down".equals(error)) {
                interval += 5;
                continue;
            }
            if ("authorization_declined".equals(error)) {
                throw new IllegalStateException("Connexion Microsoft refusee.");
            }
            if ("expired_token".equals(error)) {
                throw new IllegalStateException("Code Microsoft expire, relance la connexion.");
            }
            throw new IOException("Erreur Microsoft OAuth: " + tokenResponse.body());
        }
        throw new IllegalStateException("Code Microsoft expire, relance la connexion.");
    }

    private TokenResult refreshMicrosoft(String refreshToken) throws IOException, InterruptedException {
        Http.HttpResult response = Http.postForm(TOKEN_URL, Map.of(
                "client_id", config.microsoftClientId(),
                "grant_type", "refresh_token",
                "refresh_token", refreshToken,
                "scope", SCOPE
        ));
        response.requireSuccess("refresh Microsoft");
        return tokenResult(Json.parseObject(response.body()));
    }

    private AuthSession completeMinecraftLogin(String microsoftAccessToken, String microsoftRefreshToken, AuthCache cache)
            throws Exception {
        listener.status("Authentification Xbox Live...");
        XboxLiveResult xbl = authenticateXboxLive(microsoftAccessToken);
        listener.status("Obtention du jeton XSTS Minecraft...");
        XboxLiveResult xsts = authorizeXsts(xbl.token());
        listener.status("Connexion aux services Minecraft...");
        MinecraftToken minecraft = loginMinecraft(xsts.userHash(), xsts.token());
        verifyOwnership(minecraft.accessToken());
        Profile profile = fetchProfile(minecraft.accessToken());

        cache.setMicrosoftRefreshToken(microsoftRefreshToken);
        cache.setMinecraftAccessToken(minecraft.accessToken());
        cache.setMinecraftExpiresAtMillis(minecraft.expiresAtMillis());
        cache.setProfileName(profile.name());
        cache.setUuid(profile.id());
        cache.setXuid(xsts.xuid());
        return cache.toSession();
    }

    private XboxLiveResult authenticateXboxLive(String microsoftAccessToken) throws IOException, InterruptedException {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("AuthMethod", "RPS");
        properties.put("SiteName", "user.auth.xboxlive.com");
        properties.put("RpsTicket", "d=" + microsoftAccessToken);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("Properties", properties);
        payload.put("RelyingParty", "http://auth.xboxlive.com");
        payload.put("TokenType", "JWT");

        Http.HttpResult response = Http.postJson("https://user.auth.xboxlive.com/user/authenticate", Json.stringify(payload, false), Map.of());
        response.requireSuccess("Xbox Live");
        return parseXboxToken(Json.parseObject(response.body()));
    }

    private XboxLiveResult authorizeXsts(String xblToken) throws IOException, InterruptedException {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("SandboxId", "RETAIL");
        properties.put("UserTokens", List.of(xblToken));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("Properties", properties);
        payload.put("RelyingParty", "rp://api.minecraftservices.com/");
        payload.put("TokenType", "JWT");

        Http.HttpResult response = Http.postJson("https://xsts.auth.xboxlive.com/xsts/authorize", Json.stringify(payload, false), Map.of());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            Map<String, Object> error = Json.parseObject(response.body());
            long xerr = Json.longValue(error, "XErr", 0L);
            throw new IllegalStateException(xstsErrorMessage(xerr, response.body()));
        }
        return parseXboxToken(Json.parseObject(response.body()));
    }

    private MinecraftToken loginMinecraft(String userHash, String xstsToken) throws IOException, InterruptedException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("identityToken", "XBL3.0 x=" + userHash + ";" + xstsToken);
        Http.HttpResult response = Http.postJson(
                "https://api.minecraftservices.com/authentication/login_with_xbox",
                Json.stringify(payload, false),
                Map.of()
        );
        response.requireSuccess("login Minecraft");
        Map<String, Object> map = Json.parseObject(response.body());
        String accessToken = Json.str(map, "access_token", "");
        int expiresIn = Json.integer(map, "expires_in", 3600);
        return new MinecraftToken(accessToken, Instant.now().plusSeconds(Math.max(60, expiresIn - 60L)).toEpochMilli());
    }

    private void verifyOwnership(String minecraftAccessToken) throws IOException, InterruptedException {
        Http.HttpResult response = Http.get("https://api.minecraftservices.com/entitlements/mcstore", Map.of(
                "Authorization", "Bearer " + minecraftAccessToken
        ));
        response.requireSuccess("entitlements Minecraft");
        Map<String, Object> map = Json.parseObject(response.body());
        List<Object> items = Json.list(map, "items");
        List<String> names = new ArrayList<>();
        for (Object item : items) {
            if (item instanceof Map<?, ?> raw) {
                Object name = raw.get("name");
                if (name != null) {
                    names.add(String.valueOf(name));
                }
            }
        }
        boolean ownsMinecraft = names.stream().anyMatch(name ->
                "game_minecraft".equalsIgnoreCase(name)
                        || "product_minecraft".equalsIgnoreCase(name)
                        || name.toLowerCase().contains("minecraft"));
        if (!ownsMinecraft) {
            throw new IllegalStateException("Ce compte Microsoft ne semble pas posseder Minecraft Java Edition.");
        }
    }

    private Profile fetchProfile(String minecraftAccessToken) throws IOException, InterruptedException {
        Http.HttpResult response = Http.get("https://api.minecraftservices.com/minecraft/profile", Map.of(
                "Authorization", "Bearer " + minecraftAccessToken
        ));
        if (response.statusCode() == 404) {
            throw new IllegalStateException("Aucun profil Minecraft Java trouve pour ce compte.");
        }
        response.requireSuccess("profil Minecraft");
        Map<String, Object> map = Json.parseObject(response.body());
        return new Profile(Json.str(map, "id", ""), Json.str(map, "name", ""));
    }

    @SuppressWarnings("unchecked")
    private XboxLiveResult parseXboxToken(Map<String, Object> map) {
        String token = Json.str(map, "Token", "");
        String userHash = "";
        String xuid = "";
        Map<String, Object> displayClaims = Json.object(map, "DisplayClaims");
        for (Object item : Json.list(displayClaims, "xui")) {
            if (item instanceof Map<?, ?> raw) {
                Map<String, Object> xui = (Map<String, Object>) raw;
                userHash = Json.str(xui, "uhs", userHash);
                xuid = Json.str(xui, "xid", xuid);
            }
        }
        return new XboxLiveResult(token, userHash, xuid);
    }

    private TokenResult tokenResult(Map<String, Object> token) {
        return new TokenResult(Json.str(token, "access_token", ""), Json.str(token, "refresh_token", ""));
    }

    private void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
            }
        } catch (Exception ignored) {
            listener.status("Impossible d'ouvrir le navigateur automatiquement.");
        }
    }

    private String xstsErrorMessage(long xerr, String fallback) {
        if (xerr == 2148916233L) {
            return "Ce compte Microsoft n'a pas de compte Xbox Live configure.";
        }
        if (xerr == 2148916235L) {
            return "Xbox Live n'est pas disponible dans la region de ce compte.";
        }
        if (xerr == 2148916238L) {
            return "Compte enfant: un adulte doit autoriser Xbox Live/Minecraft.";
        }
        return "Erreur XSTS Minecraft: " + fallback;
    }

    private record TokenResult(String accessToken, String refreshToken) {
    }

    private record XboxLiveResult(String token, String userHash, String xuid) {
    }

    private record MinecraftToken(String accessToken, long expiresAtMillis) {
    }

    private record Profile(String id, String name) {
    }
}
