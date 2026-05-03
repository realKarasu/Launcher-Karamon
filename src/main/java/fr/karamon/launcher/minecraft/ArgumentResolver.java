package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.util.Json;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class ArgumentResolver {
    private ArgumentResolver() {
    }

    public static List<String> resolveList(List<Object> rawArgs, Map<String, String> placeholders) {
        List<String> resolved = new ArrayList<>();
        for (Object item : rawArgs) {
            if (item instanceof String text) {
                resolved.add(replace(text, placeholders));
            } else if (item instanceof Map<?, ?> raw) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) raw;
                if (!RuleEvaluator.allowed(map.get("rules"), false)) {
                    continue;
                }
                Object value = map.get("value");
                if (value instanceof String text) {
                    resolved.add(replace(text, placeholders));
                } else if (value instanceof List<?> list) {
                    for (Object nested : list) {
                        if (nested != null) {
                            resolved.add(replace(String.valueOf(nested), placeholders));
                        }
                    }
                }
            }
        }
        return resolved;
    }

    public static List<String> gameArguments(Map<String, Object> version, Map<String, String> placeholders) {
        Map<String, Object> args = Json.object(version, "arguments");
        List<Object> game = Json.list(args, "game");
        if (!game.isEmpty()) {
            return resolveList(game, placeholders);
        }
        String legacy = Json.str(version, "minecraftArguments", "");
        if (legacy.isBlank()) {
            return List.of();
        }
        List<Object> split = new ArrayList<>();
        for (String part : legacy.split(" ")) {
            if (!part.isBlank()) {
                split.add(part);
            }
        }
        return resolveList(split, placeholders);
    }

    public static List<String> jvmArguments(Map<String, Object> version, Map<String, String> placeholders) {
        Map<String, Object> args = Json.object(version, "arguments");
        List<Object> jvm = Json.list(args, "jvm");
        if (!jvm.isEmpty()) {
            return resolveList(jvm, placeholders);
        }
        return new ArrayList<>(List.of(
                "-Djava.library.path=${natives_directory}",
                "-Dminecraft.launcher.brand=${launcher_name}",
                "-Dminecraft.launcher.version=${launcher_version}",
                "-cp",
                "${classpath}"
        )).stream().map(value -> replace(value, placeholders)).toList();
    }

    private static String replace(String value, Map<String, String> placeholders) {
        String out = value;
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            out = out.replace("${" + entry.getKey() + "}", entry.getValue());
        }
        return out;
    }
}
