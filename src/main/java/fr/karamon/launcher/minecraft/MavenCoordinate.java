package fr.karamon.launcher.minecraft;

public final class MavenCoordinate {
    private final String group;
    private final String artifact;
    private final String version;
    private final String classifier;
    private final String extension;

    private MavenCoordinate(String group, String artifact, String version, String classifier, String extension) {
        this.group = group;
        this.artifact = artifact;
        this.version = version;
        this.classifier = classifier;
        this.extension = extension;
    }

    public static MavenCoordinate parse(String name) {
        String coordinate = name;
        String extension = "jar";
        int extIndex = name.indexOf('@');
        if (extIndex >= 0) {
            coordinate = name.substring(0, extIndex);
            extension = name.substring(extIndex + 1);
        }
        String[] parts = coordinate.split(":");
        if (parts.length < 3) {
            throw new IllegalArgumentException("Coordonnee Maven invalide: " + name);
        }
        String classifier = parts.length >= 4 ? parts[3] : "";
        return new MavenCoordinate(parts[0], parts[1], parts[2], classifier, extension);
    }

    public String path() {
        StringBuilder file = new StringBuilder();
        file.append(artifact).append('-').append(version);
        if (classifier != null && !classifier.isBlank()) {
            file.append('-').append(classifier);
        }
        file.append('.').append(extension);
        return group.replace('.', '/') + "/" + artifact + "/" + version + "/" + file;
    }

    public String url(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        return normalized + path();
    }
}
