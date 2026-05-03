package fr.karamon.launcher.config;

import fr.karamon.launcher.util.Json;

import java.util.LinkedHashMap;
import java.util.Map;

public record LauncherConfig(
        String instanceName,
        String minecraftVersion,
        String loader,
        String fabricLoaderVersion,
        String microsoftClientId,
        String modpackManifestUrl,
        int memoryMb,
        String javaPath,
        boolean closeLauncherOnGameStart,
        boolean checkOwnershipEveryLaunch,
        Server server
) {
    public static final String CLIENT_ID_PLACEHOLDER = "PUT_YOUR_AZURE_APP_CLIENT_ID_HERE";

    public static LauncherConfig defaults() {
        return new LauncherConfig(
                "Karamon",
                "1.21.1",
                "fabric",
                "0.19.2",
                CLIENT_ID_PLACEHOLDER,
                "",
                4096,
                "",
                false,
                true,
                new Server("", 25565, false)
        );
    }

    public static LauncherConfig fromMap(Map<String, Object> map) {
        Map<String, Object> server = Json.object(map, "server");
        LauncherConfig defaults = defaults();
        return new LauncherConfig(
                Json.str(map, "instanceName", defaults.instanceName),
                Json.str(map, "minecraftVersion", defaults.minecraftVersion),
                Json.str(map, "loader", defaults.loader).toLowerCase(),
                Json.str(map, "fabricLoaderVersion", defaults.fabricLoaderVersion),
                Json.str(map, "microsoftClientId", defaults.microsoftClientId),
                Json.str(map, "modpackManifestUrl", defaults.modpackManifestUrl),
                Json.integer(map, "memoryMb", defaults.memoryMb),
                Json.str(map, "javaPath", defaults.javaPath),
                Json.bool(map, "closeLauncherOnGameStart", defaults.closeLauncherOnGameStart),
                Json.bool(map, "checkOwnershipEveryLaunch", defaults.checkOwnershipEveryLaunch),
                new Server(
                        Json.str(server, "host", defaults.server.host),
                        Json.integer(server, "port", defaults.server.port),
                        Json.bool(server, "autoJoin", defaults.server.autoJoin)
                )
        );
    }

    public Map<String, Object> toMap() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("instanceName", instanceName);
        root.put("minecraftVersion", minecraftVersion);
        root.put("loader", loader);
        root.put("fabricLoaderVersion", fabricLoaderVersion);
        root.put("microsoftClientId", microsoftClientId);
        root.put("modpackManifestUrl", modpackManifestUrl);
        root.put("memoryMb", memoryMb);
        root.put("javaPath", javaPath);
        root.put("closeLauncherOnGameStart", closeLauncherOnGameStart);
        root.put("checkOwnershipEveryLaunch", checkOwnershipEveryLaunch);
        Map<String, Object> serverMap = new LinkedHashMap<>();
        serverMap.put("host", server.host);
        serverMap.put("port", server.port);
        serverMap.put("autoJoin", server.autoJoin);
        root.put("server", serverMap);
        return root;
    }

    public boolean hasMicrosoftClientId() {
        return microsoftClientId != null
                && !microsoftClientId.isBlank()
                && !CLIENT_ID_PLACEHOLDER.equals(microsoftClientId);
    }

    public record Server(String host, int port, boolean autoJoin) {
    }
}
