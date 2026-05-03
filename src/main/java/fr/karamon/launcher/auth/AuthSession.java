package fr.karamon.launcher.auth;

public record AuthSession(
        String profileName,
        String uuid,
        String accessToken,
        String xuid,
        long expiresAtMillis
) {
}
