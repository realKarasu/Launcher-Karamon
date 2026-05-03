package fr.karamon.launcher;

import fr.karamon.launcher.config.LauncherConfig;

import java.nio.file.Path;
import java.util.Locale;

public final class AppPaths {
    private final Path projectDir;
    private final Path dataDir;
    private final Path instancesDir;
    private final Path versionsDir;
    private final Path librariesDir;
    private final Path assetsDir;
    private final Path cacheDir;

    public AppPaths(Path projectDir) {
        this.projectDir = projectDir.toAbsolutePath().normalize();
        this.dataDir = defaultDataDir();
        this.instancesDir = dataDir.resolve("instances");
        this.versionsDir = dataDir.resolve("versions");
        this.librariesDir = dataDir.resolve("libraries");
        this.assetsDir = dataDir.resolve("assets");
        this.cacheDir = dataDir.resolve("cache");
    }

    public Path projectDir() {
        return projectDir;
    }

    public Path configDir() {
        return projectDir.resolve("config");
    }

    public Path launcherConfig() {
        return configDir().resolve("launcher.json");
    }

    public Path modpackManifest() {
        return configDir().resolve("modpack.json");
    }

    public Path dataDir() {
        return dataDir;
    }

    public Path instancesDir() {
        return instancesDir;
    }

    public Path instanceDir(LauncherConfig config) {
        return instancesDir.resolve(config.instanceName());
    }

    public Path versionsDir() {
        return versionsDir;
    }

    public Path librariesDir() {
        return librariesDir;
    }

    public Path assetsDir() {
        return assetsDir;
    }

    public Path cacheDir() {
        return cacheDir;
    }

    public Path authCache() {
        return dataDir.resolve("auth-cache.json");
    }

    private static Path defaultDataDir() {
        String appData = System.getenv("APPDATA");
        if (appData != null && !appData.isBlank()) {
            return Path.of(appData, ".karamon-launcher");
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String home = System.getProperty("user.home");
        if (os.contains("mac")) {
            return Path.of(home, "Library", "Application Support", "KaramonLauncher");
        }
        return Path.of(home, ".karamon-launcher");
    }
}
