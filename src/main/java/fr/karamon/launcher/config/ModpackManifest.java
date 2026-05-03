package fr.karamon.launcher.config;

import fr.karamon.launcher.util.Json;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ModpackManifest(
        String name,
        String version,
        boolean removeUnlistedMods,
        List<ModEntry> mods
) {
    public static ModpackManifest defaults() {
        return new ModpackManifest(
                "Karamon",
                "2026.05.03",
                true,
                List.of(new ModEntry(
                        "Exemple desactive - remplace par ton premier mod",
                        "exemple-mod.jar",
                        "https://example.com/exemple-mod.jar",
                        "",
                        false
                ))
        );
    }

    @SuppressWarnings("unchecked")
    public static ModpackManifest fromMap(Map<String, Object> map) {
        List<ModEntry> entries = new ArrayList<>();
        for (Object item : Json.list(map, "mods")) {
            if (item instanceof Map<?, ?> raw) {
                entries.add(ModEntry.fromMap((Map<String, Object>) raw));
            }
        }
        ModpackManifest defaults = defaults();
        return new ModpackManifest(
                Json.str(map, "name", defaults.name),
                Json.str(map, "version", defaults.version),
                Json.bool(map, "removeUnlistedMods", defaults.removeUnlistedMods),
                entries
        );
    }

    public Map<String, Object> toMap() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("name", name);
        root.put("version", version);
        root.put("removeUnlistedMods", removeUnlistedMods);
        List<Object> list = new ArrayList<>();
        for (ModEntry mod : mods) {
            list.add(mod.toMap());
        }
        root.put("mods", list);
        return root;
    }

    public long enabledCount() {
        return mods.stream().filter(ModEntry::enabled).count();
    }
}
