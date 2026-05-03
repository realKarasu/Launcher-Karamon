package fr.karamon.launcher;

import fr.karamon.launcher.auth.AuthSession;
import fr.karamon.launcher.auth.MinecraftAuthService;
import fr.karamon.launcher.config.ConfigStore;
import fr.karamon.launcher.config.LauncherConfig;
import fr.karamon.launcher.config.ModpackManifest;
import fr.karamon.launcher.minecraft.InstanceManager;
import fr.karamon.launcher.util.ProgressListener;

import java.awt.Desktop;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class LauncherController {
    private final AppPaths paths;
    private final ConfigStore store;

    public LauncherController(AppPaths paths, ConfigStore store) {
        this.paths = paths;
        this.store = store;
    }

    public Map<String, Object> summary() throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        ModpackManifest manifest = store.loadManifest();
        return store.summary(config, manifest);
    }

    public String cachedAccountLabel() throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        return new MinecraftAuthService(paths.authCache(), config, new ProgressListener() {
        }).cachedAccountLabel();
    }

    public AuthSession login(ProgressListener listener) throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        return new MinecraftAuthService(paths.authCache(), config, listener).ensureAuthenticated();
    }

    public void logout() throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        new MinecraftAuthService(paths.authCache(), config, new ProgressListener() {
        }).logout();
    }

    public void syncOnly(ProgressListener listener) throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        ModpackManifest manifest = store.loadManifest(config, listener);
        new InstanceManager(paths, config, listener).sync(manifest);
    }

    public void launch(ProgressListener listener) throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        ModpackManifest manifest = store.loadManifest(config, listener);
        MinecraftAuthService auth = new MinecraftAuthService(paths.authCache(), config, listener);
        AuthSession session = auth.ensureAuthenticated();
        new InstanceManager(paths, config, listener).syncAndLaunch(manifest, session);
        if (config.closeLauncherOnGameStart()) {
            System.exit(0);
        }
    }

    public Path instanceDir() throws Exception {
        LauncherConfig config = store.loadLauncherConfig();
        return paths.instanceDir(config);
    }

    public Path manifestPath() {
        return paths.modpackManifest();
    }

    public Path launcherConfigPath() {
        return paths.launcherConfig();
    }

    public Path dataDir() {
        return paths.dataDir();
    }

    public void open(Path path) throws Exception {
        if (Files.notExists(path)) {
            Files.createDirectories(path);
        }
        if (!Desktop.isDesktopSupported()) {
            throw new IllegalStateException("Desktop.open n'est pas disponible sur cette machine.");
        }
        Desktop.getDesktop().open(path.toFile());
    }
}
