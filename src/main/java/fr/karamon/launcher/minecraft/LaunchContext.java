package fr.karamon.launcher.minecraft;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public record LaunchContext(
        Path instanceDir,
        Path assetsDir,
        Path nativesDir,
        List<Path> classpath,
        String mainClass,
        String versionName,
        String assetIndexId,
        Map<String, Object> vanillaVersion,
        Map<String, Object> loaderVersion
) {
}
