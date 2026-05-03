package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.AppPaths;
import fr.karamon.launcher.auth.AuthSession;
import fr.karamon.launcher.config.LauncherConfig;
import fr.karamon.launcher.config.ModpackManifest;
import fr.karamon.launcher.util.ProgressListener;

import java.nio.file.Files;
import java.nio.file.Path;

public final class InstanceManager {
    private final AppPaths paths;
    private final LauncherConfig config;
    private final ProgressListener listener;

    public InstanceManager(AppPaths paths, LauncherConfig config, ProgressListener listener) {
        this.paths = paths;
        this.config = config;
        this.listener = listener;
    }

    public Path instanceDir() {
        return paths.instanceDir(config);
    }

    public void sync(ModpackManifest manifest) throws Exception {
        prepareDirectories();
        new ModSynchronizer(instanceDir().resolve("mods"), listener).sync(manifest);
        new MinecraftInstaller(paths, config, listener).install();
    }

    public Process syncAndLaunch(ModpackManifest manifest, AuthSession session) throws Exception {
        prepareDirectories();
        new ModSynchronizer(instanceDir().resolve("mods"), listener).sync(manifest);
        LaunchContext context = new MinecraftInstaller(paths, config, listener).install();
        return new GameLauncher(config, listener).launch(context, session);
    }

    private void prepareDirectories() throws Exception {
        Files.createDirectories(paths.dataDir());
        Files.createDirectories(paths.instancesDir());
        Files.createDirectories(instanceDir());
        Files.createDirectories(instanceDir().resolve("mods"));
        Files.createDirectories(instanceDir().resolve("config"));
        Files.createDirectories(paths.cacheDir());
    }
}
