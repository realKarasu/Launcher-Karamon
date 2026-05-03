package fr.karamon.launcher.config;

import fr.karamon.launcher.AppPaths;
import fr.karamon.launcher.util.Http;
import fr.karamon.launcher.util.Json;
import fr.karamon.launcher.util.ProgressListener;

import java.io.IOException;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

public final class ConfigStore {
    private final AppPaths paths;

    public ConfigStore(AppPaths paths) {
        this.paths = paths;
    }

    public void ensureDefaults() throws IOException {
        Files.createDirectories(paths.configDir());
        if (Files.notExists(paths.launcherConfig())) {
            Json.writePretty(paths.launcherConfig(), LauncherConfig.defaults().toMap());
        }
        if (Files.notExists(paths.modpackManifest())) {
            Json.writePretty(paths.modpackManifest(), ModpackManifest.defaults().toMap());
        }
    }

    public LauncherConfig loadLauncherConfig() throws IOException {
        return LauncherConfig.fromMap(Json.readObject(paths.launcherConfig()));
    }

    public ModpackManifest loadManifest() throws IOException {
        return ModpackManifest.fromMap(Json.readObject(paths.modpackManifest()));
    }

    public ModpackManifest loadManifest(LauncherConfig config, ProgressListener listener) throws IOException, InterruptedException {
        if (config.modpackManifestUrl() == null || config.modpackManifestUrl().isBlank()) {
            return loadManifest();
        }
        listener.status("Mise a jour du manifeste distant...");
        String json = Http.getText(config.modpackManifestUrl());
        ModpackManifest manifest = ModpackManifest.fromMap(Json.parseObject(json));
        Json.writePretty(paths.modpackManifest(), manifest.toMap());
        listener.status("Manifeste modpack mis a jour: " + manifest.version());
        return manifest;
    }

    public Map<String, Object> summary(LauncherConfig config, ModpackManifest manifest) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("instance", config.instanceName());
        map.put("minecraft", config.minecraftVersion());
        map.put("loader", config.loader());
        map.put("mods", manifest.enabledCount());
        map.put("dataDir", paths.dataDir().toString());
        return map;
    }
}
