package fr.karamon.launcher.minecraft;

import fr.karamon.launcher.config.ModEntry;
import fr.karamon.launcher.config.ModpackManifest;
import fr.karamon.launcher.util.Hashes;
import fr.karamon.launcher.util.Http;
import fr.karamon.launcher.util.ProgressListener;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class ModSynchronizer {
    private final Path modsDir;
    private final ProgressListener listener;

    public ModSynchronizer(Path modsDir, ProgressListener listener) {
        this.modsDir = modsDir;
        this.listener = listener;
    }

    public void sync(ModpackManifest manifest) throws IOException, InterruptedException {
        Files.createDirectories(modsDir);
        listener.status("Synchronisation des mods " + manifest.name() + "...");
        Set<String> expected = new HashSet<>();
        int index = 0;
        long total = manifest.mods().stream().filter(ModEntry::enabled).count();
        for (ModEntry mod : manifest.mods()) {
            if (!mod.enabled()) {
                continue;
            }
            index++;
            validate(mod);
            expected.add(mod.fileName().toLowerCase(Locale.ROOT));
            Path target = modsDir.resolve(mod.fileName()).normalize();
            if (!target.startsWith(modsDir)) {
                throw new IOException("Nom de mod invalide: " + mod.fileName());
            }
            boolean force = mod.sha1() == null || mod.sha1().isBlank();
            if (Files.exists(target) && !force && mod.sha1().equalsIgnoreCase(Hashes.sha1(target))) {
                listener.status("Mod a jour: " + mod.name());
            } else {
                listener.status("Telechargement mod " + index + "/" + total + ": " + mod.name());
                Http.download(mod.url(), target, mod.sha1(), listener, mod.name(), force);
            }
        }
        if (manifest.removeUnlistedMods()) {
            removeUnlisted(expected);
        }
        listener.status("Mods synchronises: " + total + " actif(s).");
    }

    private void validate(ModEntry mod) {
        if (mod.fileName() == null || mod.fileName().isBlank()) {
            throw new IllegalArgumentException("Un mod actif n'a pas de fileName.");
        }
        if (mod.url() == null || mod.url().isBlank()) {
            throw new IllegalArgumentException("Le mod " + mod.fileName() + " n'a pas d'url.");
        }
        if (!mod.fileName().toLowerCase(Locale.ROOT).endsWith(".jar")) {
            throw new IllegalArgumentException("Le mod " + mod.fileName() + " doit etre un .jar.");
        }
    }

    private void removeUnlisted(Set<String> expected) throws IOException {
        try (var stream = Files.list(modsDir)) {
            for (Path file : stream.toList()) {
                String name = file.getFileName().toString();
                if (Files.isRegularFile(file)
                        && name.toLowerCase(Locale.ROOT).endsWith(".jar")
                        && !expected.contains(name.toLowerCase(Locale.ROOT))) {
                    Files.delete(file);
                    listener.status("Mod retire de l'instance: " + name);
                }
            }
        }
    }
}
