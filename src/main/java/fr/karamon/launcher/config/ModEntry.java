package fr.karamon.launcher.config;

import fr.karamon.launcher.util.Json;

import java.util.LinkedHashMap;
import java.util.Map;

public record ModEntry(
        String name,
        String fileName,
        String url,
        String sha1,
        boolean enabled
) {
    public static ModEntry fromMap(Map<String, Object> map) {
        return new ModEntry(
                Json.str(map, "name", ""),
                Json.str(map, "fileName", ""),
                Json.str(map, "url", ""),
                Json.str(map, "sha1", ""),
                Json.bool(map, "enabled", true)
        );
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("fileName", fileName);
        map.put("url", url);
        map.put("sha1", sha1);
        map.put("enabled", enabled);
        return map;
    }
}
