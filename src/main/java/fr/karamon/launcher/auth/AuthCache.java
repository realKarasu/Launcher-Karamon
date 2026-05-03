package fr.karamon.launcher.auth;

import fr.karamon.launcher.util.Json;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AuthCache {
    private String microsoftRefreshToken = "";
    private String minecraftAccessToken = "";
    private long minecraftExpiresAtMillis = 0L;
    private String profileName = "";
    private String uuid = "";
    private String xuid = "";

    public static AuthCache load(Path path) throws IOException {
        AuthCache cache = new AuthCache();
        if (Files.notExists(path)) {
            return cache;
        }
        Map<String, Object> map = Json.readObject(path);
        cache.microsoftRefreshToken = Json.str(map, "microsoftRefreshToken", "");
        cache.minecraftAccessToken = Json.str(map, "minecraftAccessToken", "");
        cache.minecraftExpiresAtMillis = Json.longValue(map, "minecraftExpiresAtMillis", 0L);
        cache.profileName = Json.str(map, "profileName", "");
        cache.uuid = Json.str(map, "uuid", "");
        cache.xuid = Json.str(map, "xuid", "");
        return cache;
    }

    public void save(Path path) throws IOException {
        Json.writePretty(path, toMap());
    }

    public boolean hasRefreshToken() {
        return microsoftRefreshToken != null && !microsoftRefreshToken.isBlank();
    }

    public boolean hasUsableMinecraftToken() {
        return minecraftAccessToken != null
                && !minecraftAccessToken.isBlank()
                && minecraftExpiresAtMillis > System.currentTimeMillis() + 60_000L
                && profileName != null
                && !profileName.isBlank()
                && uuid != null
                && !uuid.isBlank();
    }

    public AuthSession toSession() {
        return new AuthSession(profileName, uuid, minecraftAccessToken, xuid, minecraftExpiresAtMillis);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("microsoftRefreshToken", microsoftRefreshToken);
        map.put("minecraftAccessToken", minecraftAccessToken);
        map.put("minecraftExpiresAtMillis", minecraftExpiresAtMillis);
        map.put("profileName", profileName);
        map.put("uuid", uuid);
        map.put("xuid", xuid);
        return map;
    }

    public void setMicrosoftRefreshToken(String microsoftRefreshToken) {
        this.microsoftRefreshToken = microsoftRefreshToken;
    }

    public void setMinecraftAccessToken(String minecraftAccessToken) {
        this.minecraftAccessToken = minecraftAccessToken;
    }

    public void setMinecraftExpiresAtMillis(long minecraftExpiresAtMillis) {
        this.minecraftExpiresAtMillis = minecraftExpiresAtMillis;
    }

    public void setProfileName(String profileName) {
        this.profileName = profileName;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }

    public void setXuid(String xuid) {
        this.xuid = xuid;
    }

    public String microsoftRefreshToken() {
        return microsoftRefreshToken;
    }

    public String profileName() {
        return profileName;
    }

    public String uuid() {
        return uuid;
    }
}
