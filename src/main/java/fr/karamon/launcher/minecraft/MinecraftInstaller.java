package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.AppPaths;
import fr.karamon.launcher.config.LauncherConfig;
import fr.karamon.launcher.util.Hashes;
import fr.karamon.launcher.util.Http;
import fr.karamon.launcher.util.Json;
import fr.karamon.launcher.util.Os;
import fr.karamon.launcher.util.ProgressListener;
import fr.karamon.launcher.util.ZipUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MinecraftInstaller {
    private static final String VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    private static final String FABRIC_PROFILE = "https://meta.fabricmc.net/v2/versions/loader/%s/%s/profile/json";

    private final AppPaths paths;
    private final LauncherConfig config;
    private final ProgressListener listener;

    public MinecraftInstaller(AppPaths paths, LauncherConfig config, ProgressListener listener) {
        this.paths = paths;
        this.config = config;
        this.listener = listener;
    }

    public LaunchContext install() throws Exception {
        Files.createDirectories(paths.versionsDir());
        Files.createDirectories(paths.librariesDir());
        Files.createDirectories(paths.assetsDir());

        listener.status("Preparation Minecraft " + config.minecraftVersion() + "...");
        Map<String, Object> vanilla = installVanillaVersion();
        Map<String, Object> loader = installLoaderVersion();

        LinkedHashSet<Path> classpath = new LinkedHashSet<>();
        Path nativesDir = paths.versionsDir().resolve(versionName(loader, vanilla)).resolve("natives");
        Files.createDirectories(nativesDir);

        downloadLibraries(Json.list(vanilla, "libraries"), classpath, nativesDir);
        if (!loader.isEmpty()) {
            downloadLibraries(Json.list(loader, "libraries"), classpath, nativesDir);
        }

        downloadClientJar(vanilla, classpath);
        String assetIndexId = downloadAssets(vanilla);
        String mainClass = Json.str(loader.isEmpty() ? vanilla : loader, "mainClass", Json.str(vanilla, "mainClass", ""));

        return new LaunchContext(
                paths.instanceDir(config),
                paths.assetsDir(),
                nativesDir,
                new ArrayList<>(classpath),
                mainClass,
                versionName(loader, vanilla),
                assetIndexId,
                vanilla,
                loader
        );
    }

    private Map<String, Object> installVanillaVersion() throws Exception {
        Map<String, Object> manifest = Json.parseObject(Http.getText(VERSION_MANIFEST));
        Map<String, Object> versionEntry = findVersion(manifest, config.minecraftVersion());
        String url = Json.str(versionEntry, "url", "");
        String sha1 = Json.str(versionEntry, "sha1", "");
        Path versionDir = paths.versionsDir().resolve(config.minecraftVersion());
        Path versionJson = versionDir.resolve(config.minecraftVersion() + ".json");
        listener.status("Verification du profil Minecraft officiel...");
        Http.download(url, versionJson, sha1, listener, "version " + config.minecraftVersion());
        return Json.readObject(versionJson);
    }

    private Map<String, Object> installLoaderVersion() throws Exception {
        if (!"fabric".equalsIgnoreCase(config.loader())) {
            throw new IllegalStateException("Loader non supporte pour l'instant: " + config.loader() + ". Configure loader=fabric.");
        }
        String url = FABRIC_PROFILE.formatted(config.minecraftVersion(), config.fabricLoaderVersion());
        String id = "fabric-loader-" + config.fabricLoaderVersion() + "-" + config.minecraftVersion();
        Path dir = paths.versionsDir().resolve(id);
        Path profile = dir.resolve(id + ".json");
        listener.status("Verification du profil Fabric " + config.fabricLoaderVersion() + "...");
        Http.download(url, profile, "", listener, "Fabric " + config.fabricLoaderVersion());
        return Json.readObject(profile);
    }

    private Map<String, Object> findVersion(Map<String, Object> manifest, String version) {
        for (Object item : Json.list(manifest, "versions")) {
            if (item instanceof Map<?, ?> raw) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) raw;
                if (version.equals(Json.str(map, "id", ""))) {
                    return map;
                }
            }
        }
        throw new IllegalArgumentException("Version Minecraft inconnue: " + version);
    }

    private void downloadClientJar(Map<String, Object> vanilla, LinkedHashSet<Path> classpath) throws Exception {
        Map<String, Object> downloads = Json.object(vanilla, "downloads");
        Map<String, Object> client = Json.object(downloads, "client");
        String url = Json.str(client, "url", "");
        String sha1 = Json.str(client, "sha1", "");
        String id = Json.str(vanilla, "id", config.minecraftVersion());
        Path jar = paths.versionsDir().resolve(id).resolve(id + ".jar");
        listener.status("Verification du client Minecraft...");
        Http.download(url, jar, sha1, listener, "client Minecraft");
        classpath.add(jar);
    }

    private void downloadLibraries(List<Object> libraries, LinkedHashSet<Path> classpath, Path nativesDir) throws Exception {
        int index = 0;
        for (Object item : libraries) {
            index++;
            if (!(item instanceof Map<?, ?> raw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> library = (Map<String, Object>) raw;
            if (!RuleEvaluator.allowed(library.get("rules"), true)) {
                continue;
            }
            String name = Json.str(library, "name", "lib-" + index);
            listener.status("Verification bibliotheque: " + name);
            Path artifact = downloadLibraryArtifact(library);
            if (artifact != null) {
                classpath.add(artifact);
            }
            Path nativeJar = downloadNativeArtifact(library);
            if (nativeJar != null) {
                ZipUtils.extractNatives(nativeJar, nativesDir);
            }
        }
    }

    private Path downloadLibraryArtifact(Map<String, Object> library) throws Exception {
        Map<String, Object> downloads = Json.object(library, "downloads");
        Map<String, Object> artifact = Json.object(downloads, "artifact");
        if (!artifact.isEmpty()) {
            return downloadArtifact(artifact, "library");
        }
        String name = Json.str(library, "name", "");
        if (name.isBlank()) {
            return null;
        }
        String baseUrl = Json.str(library, "url", "https://libraries.minecraft.net/");
        MavenCoordinate coordinate = MavenCoordinate.parse(name);
        Path target = safeLibraryPath(coordinate.path());
        Http.download(coordinate.url(baseUrl), target, Json.str(library, "sha1", ""), listener, name);
        return target;
    }

    private Path downloadNativeArtifact(Map<String, Object> library) throws Exception {
        Map<String, Object> natives = Json.object(library, "natives");
        String classifier = Json.str(natives, Os.minecraftName(), "");
        if (classifier.isBlank()) {
            return null;
        }
        classifier = classifier.replace("${arch}", Os.archBits());
        Map<String, Object> downloads = Json.object(library, "downloads");
        Map<String, Object> classifiers = Json.object(downloads, "classifiers");
        Map<String, Object> artifact = Json.object(classifiers, classifier);
        if (!artifact.isEmpty()) {
            return downloadArtifact(artifact, "native");
        }
        String name = Json.str(library, "name", "");
        if (name.isBlank()) {
            return null;
        }
        String baseUrl = Json.str(library, "url", "https://libraries.minecraft.net/");
        MavenCoordinate coordinate = MavenCoordinate.parse(name + ":" + classifier);
        Path target = safeLibraryPath(coordinate.path());
        Http.download(coordinate.url(baseUrl), target, "", listener, name + " native");
        return target;
    }

    private Path downloadArtifact(Map<String, Object> artifact, String label) throws Exception {
        String relativePath = Json.str(artifact, "path", "");
        String url = Json.str(artifact, "url", "");
        String sha1 = Json.str(artifact, "sha1", "");
        if (relativePath.isBlank() || url.isBlank()) {
            return null;
        }
        Path target = safeLibraryPath(relativePath);
        Http.download(url, target, sha1, listener, label);
        return target;
    }

    private Path safeLibraryPath(String relativePath) throws IOException {
        Path target = paths.librariesDir().resolve(relativePath).normalize();
        if (!target.startsWith(paths.librariesDir())) {
            throw new IOException("Chemin de bibliotheque invalide: " + relativePath);
        }
        return target;
    }

    private String downloadAssets(Map<String, Object> vanilla) throws Exception {
        Map<String, Object> assetIndex = Json.object(vanilla, "assetIndex");
        String id = Json.str(assetIndex, "id", Json.str(vanilla, "assets", "legacy"));
        String url = Json.str(assetIndex, "url", "");
        String sha1 = Json.str(assetIndex, "sha1", "");
        Path indexes = paths.assetsDir().resolve("indexes");
        Path indexFile = indexes.resolve(id + ".json");
        listener.status("Verification de l'index d'assets...");
        Http.download(url, indexFile, sha1, listener, "asset index " + id);

        Map<String, Object> index = Json.readObject(indexFile);
        Map<String, Object> objects = Json.object(index, "objects");
        int total = objects.size();
        int done = 0;
        for (Object value : objects.values()) {
            done++;
            if (!(value instanceof Map<?, ?> raw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> asset = (Map<String, Object>) raw;
            String hash = Json.str(asset, "hash", "");
            if (hash.length() < 2) {
                continue;
            }
            Path target = paths.assetsDir().resolve("objects").resolve(hash.substring(0, 2)).resolve(hash);
            if (Files.exists(target) && hash.equalsIgnoreCase(Hashes.sha1(target))) {
                if (done % 100 == 0) {
                    listener.progress(done / (double) total);
                }
                continue;
            }
            if (done % 25 == 0 || Files.notExists(target)) {
                listener.status("Assets Minecraft " + done + "/" + total);
            }
            String assetUrl = "https://resources.download.minecraft.net/" + hash.substring(0, 2) + "/" + hash;
            Http.download(assetUrl, target, hash, listener, "asset " + hash);
        }
        listener.progress(1.0);
        return id;
    }

    private String versionName(Map<String, Object> loader, Map<String, Object> vanilla) {
        if (!loader.isEmpty()) {
            return Json.str(loader, "id", "fabric-loader-" + config.fabricLoaderVersion() + "-" + config.minecraftVersion());
        }
        return Json.str(vanilla, "id", config.minecraftVersion());
    }
}
