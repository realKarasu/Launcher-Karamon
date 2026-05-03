package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.auth.AuthSession;
import fr.karamon.launcher.config.LauncherConfig;
import fr.karamon.launcher.util.Json;
import fr.karamon.launcher.util.Os;
import fr.karamon.launcher.util.ProgressListener;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class GameLauncher {
    private final LauncherConfig config;
    private final ProgressListener listener;

    public GameLauncher(LauncherConfig config, ProgressListener listener) {
        this.config = config;
        this.listener = listener;
    }

    public Process launch(LaunchContext context, AuthSession session) throws Exception {
        Files.createDirectories(context.instanceDir());
        Map<String, String> placeholders = placeholders(context, session);

        List<String> command = new ArrayList<>();
        command.add(javaExecutable());
        command.add("-Xms512M");
        command.add("-Xmx" + Math.max(1024, config.memoryMb()) + "M");
        command.addAll(ArgumentResolver.jvmArguments(context.vanillaVersion(), placeholders));
        command.addAll(ArgumentResolver.jvmArguments(context.loaderVersion(), placeholders));
        command.add(context.mainClass());
        command.addAll(ArgumentResolver.gameArguments(context.vanillaVersion(), placeholders));
        command.addAll(ArgumentResolver.gameArguments(context.loaderVersion(), placeholders));
        if (config.server().autoJoin() && !config.server().host().isBlank()) {
            command.add("--server");
            command.add(config.server().host());
            command.add("--port");
            command.add(String.valueOf(config.server().port()));
        }

        listener.status("Lancement de Minecraft...");
        Process process = new ProcessBuilder(command)
                .directory(context.instanceDir().toFile())
                .redirectErrorStream(true)
                .start();
        streamGameOutput(process);
        if (config.closeLauncherOnGameStart()) {
            listener.status("Minecraft lance, fermeture du launcher.");
        }
        return process;
    }

    private Map<String, String> placeholders(LaunchContext context, AuthSession session) {
        String classpath = context.classpath().stream()
                .map(path -> path.toAbsolutePath().toString())
                .collect(Collectors.joining(java.io.File.pathSeparator));
        Map<String, String> values = new LinkedHashMap<>();
        values.put("natives_directory", context.nativesDir().toAbsolutePath().toString());
        values.put("launcher_name", "KaramonLauncher");
        values.put("launcher_version", "1.0.0");
        values.put("classpath", classpath);
        values.put("classpath_separator", java.io.File.pathSeparator);
        values.put("auth_player_name", session.profileName());
        values.put("version_name", context.versionName());
        values.put("game_directory", context.instanceDir().toAbsolutePath().toString());
        values.put("assets_root", context.assetsDir().toAbsolutePath().toString());
        values.put("assets_index_name", context.assetIndexId());
        values.put("auth_uuid", session.uuid());
        values.put("auth_access_token", session.accessToken());
        values.put("clientid", config.microsoftClientId());
        values.put("auth_xuid", session.xuid() == null ? "" : session.xuid());
        values.put("user_type", "msa");
        values.put("version_type", "Karamon");
        values.put("user_properties", "{}");
        values.put("game_assets", context.assetsDir().resolve("virtual").resolve("legacy").toString());
        return values;
    }

    private String javaExecutable() {
        if (config.javaPath() != null && !config.javaPath().isBlank()) {
            return config.javaPath();
        }
        Path javaHome = Path.of(System.getProperty("java.home"), "bin", Os.isWindows() ? "java.exe" : "java");
        return javaHome.toString();
    }

    private void streamGameOutput(Process process) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    listener.status("[Minecraft] " + line);
                }
            } catch (Exception e) {
                listener.status("Lecture logs Minecraft interrompue: " + e.getMessage());
            }
        }, "karamon-minecraft-logs");
        thread.setDaemon(true);
        thread.start();
    }
}
