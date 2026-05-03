package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.util.Json;
import fr.karamon.launcher.util.Os;

import java.util.List;
import java.util.Map;

public final class RuleEvaluator {
    private RuleEvaluator() {
    }

    @SuppressWarnings("unchecked")
    public static boolean allowed(Object rulesObject, boolean defaultAllowed) {
        if (!(rulesObject instanceof List<?> rules) || rules.isEmpty()) {
            return defaultAllowed;
        }
        boolean allowed = false;
        for (Object item : rules) {
            if (!(item instanceof Map<?, ?> raw)) {
                continue;
            }
            Map<String, Object> rule = (Map<String, Object>) raw;
            if (matches(rule)) {
                allowed = "allow".equals(Json.str(rule, "action", ""));
            }
        }
        return allowed;
    }

    private static boolean matches(Map<String, Object> rule) {
        Map<String, Object> os = Json.object(rule, "os");
        if (!os.isEmpty()) {
            String name = Json.str(os, "name", "");
            if (!name.isBlank() && !name.equals(Os.minecraftName())) {
                return false;
            }
            String arch = Json.str(os, "arch", "");
            if (!arch.isBlank() && !System.getProperty("os.arch", "").matches(arch)) {
                return false;
            }
            String version = Json.str(os, "version", "");
            if (!version.isBlank() && !System.getProperty("os.version", "").matches(version)) {
                return false;
            }
        }
        Map<String, Object> features = Json.object(rule, "features");
        return features.isEmpty();
    }
}
