package fr.karamon.launcher.util;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.StringJoiner;

public final class Http {
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(25))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private Http() {
    }

    public static HttpResult get(String url, Map<String, String> headers) throws IOException, InterruptedException {
        HttpRequest.Builder builder = baseRequest(url).GET();
        headers.forEach(builder::header);
        return send(builder.build());
    }

    public static HttpResult postJson(String url, String json, Map<String, String> headers) throws IOException, InterruptedException {
        HttpRequest.Builder builder = baseRequest(url)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8));
        headers.forEach(builder::header);
        return send(builder.build());
    }

    public static HttpResult postForm(String url, Map<String, String> form) throws IOException, InterruptedException {
        HttpRequest request = baseRequest(url)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(formEncode(form), StandardCharsets.UTF_8))
                .build();
        return send(request);
    }

    public static void download(String url, Path target, String expectedSha1, ProgressListener listener, String label)
            throws IOException, InterruptedException {
        download(url, target, expectedSha1, listener, label, false);
    }

    public static void download(String url, Path target, String expectedSha1, ProgressListener listener, String label, boolean force)
            throws IOException, InterruptedException {
        if (!force && Files.exists(target) && (expectedSha1 == null || expectedSha1.isBlank() || expectedSha1.equalsIgnoreCase(Hashes.sha1(target)))) {
            return;
        }
        Files.createDirectories(target.getParent());
        Path temp = target.resolveSibling(target.getFileName() + ".download");
        HttpRequest request = baseRequest(url).GET().build();
        HttpResponse<InputStream> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Telechargement impossible (" + response.statusCode() + "): " + url);
        }
        long total = response.headers().firstValueAsLong("content-length").orElse(-1L);
        try (InputStream in = response.body(); OutputStream out = Files.newOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            long done = 0L;
            int read;
            while ((read = in.read(buffer)) >= 0) {
                if (read == 0) {
                    continue;
                }
                out.write(buffer, 0, read);
                done += read;
                if (total > 0) {
                    listener.progress(Math.min(0.99, done / (double) total));
                }
            }
        }
        if (expectedSha1 != null && !expectedSha1.isBlank()) {
            String actual = Hashes.sha1(temp);
            if (!expectedSha1.equalsIgnoreCase(actual)) {
                Files.deleteIfExists(temp);
                throw new IOException("SHA-1 invalide pour " + label + ": attendu " + expectedSha1 + ", obtenu " + actual);
            }
        }
        Files.move(temp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        listener.progress(1.0);
    }

    public static String getText(String url) throws IOException, InterruptedException {
        HttpResult result = get(url, Map.of());
        result.requireSuccess(url);
        return result.body();
    }

    private static HttpResult send(HttpRequest request) throws IOException, InterruptedException {
        HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new HttpResult(response.statusCode(), response.body());
    }

    private static HttpRequest.Builder baseRequest(String url) {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(2))
                .header("Accept", "application/json")
                .header("User-Agent", "KaramonLauncher/1.0");
    }

    private static String formEncode(Map<String, String> form) {
        StringJoiner joiner = new StringJoiner("&");
        for (Map.Entry<String, String> entry : form.entrySet()) {
            joiner.add(encode(entry.getKey()) + "=" + encode(entry.getValue()));
        }
        return joiner.toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    public record HttpResult(int statusCode, String body) {
        public void requireSuccess(String context) throws IOException {
            if (statusCode < 200 || statusCode >= 300) {
                throw new IOException("Requete HTTP echouee (" + statusCode + ") pour " + context + ": " + body);
            }
        }
    }
}
