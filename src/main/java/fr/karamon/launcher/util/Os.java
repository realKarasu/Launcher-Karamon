package fr.karamon.launcher.util;

public final class Os {
    private Os() {
    }

    public static String minecraftName() {
        String os = System.getProperty("os.name").toLowerCase();
        if (os.contains("win")) {
            return "windows";
        }
        if (os.contains("mac") || os.contains("darwin")) {
            return "osx";
        }
        return "linux";
    }

    public static boolean isWindows() {
        return "windows".equals(minecraftName());
    }

    public static String archBits() {
        String arch = System.getProperty("os.arch", "").toLowerCase();
        return arch.contains("64") || arch.equals("aarch64") ? "64" : "32";
    }
}
