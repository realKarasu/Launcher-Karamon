package fr.karamon.launcher.util;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Json {
    private Json() {
    }

    public static Object parse(String text) {
        return new Parser(text).parse();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String text) {
        Object value = parse(text);
        if (!(value instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException("Le JSON racine doit etre un objet.");
        }
        return (Map<String, Object>) map;
    }

    public static Map<String, Object> readObject(Path path) throws IOException {
        return parseObject(Files.readString(path, StandardCharsets.UTF_8));
    }

    public static void writePretty(Path path, Object value) throws IOException {
        Files.createDirectories(path.getParent());
        Files.writeString(path, stringify(value, true), StandardCharsets.UTF_8);
    }

    public static String stringify(Object value, boolean pretty) {
        StringBuilder out = new StringBuilder();
        writeValue(out, value, pretty, 0);
        if (pretty) {
            out.append('\n');
        }
        return out.toString();
    }

    public static String str(Map<String, Object> map, String key, String fallback) {
        Object value = map.get(key);
        return value == null ? fallback : String.valueOf(value);
    }

    public static int integer(Map<String, Object> map, String key, int fallback) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Integer.parseInt(text.trim());
        }
        return fallback;
    }

    public static long longValue(Map<String, Object> map, String key, long fallback) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text.trim());
        }
        return fallback;
    }

    public static boolean bool(Map<String, Object> map, String key, boolean fallback) {
        Object value = map.get(key);
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof String text && !text.isBlank()) {
            return Boolean.parseBoolean(text.trim());
        }
        return fallback;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Map<?, ?> nested) {
            return (Map<String, Object>) nested;
        }
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof List<?> list) {
            return (List<Object>) list;
        }
        return List.of();
    }

    public static String atString(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static void writeValue(StringBuilder out, Object value, boolean pretty, int indent) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String text) {
            writeString(out, text);
        } else if (value instanceof Number || value instanceof Boolean) {
            out.append(value);
        } else if (value instanceof Map<?, ?> map) {
            writeObject(out, map, pretty, indent);
        } else if (value instanceof Collection<?> collection) {
            writeArray(out, collection, pretty, indent);
        } else {
            writeString(out, String.valueOf(value));
        }
    }

    private static void writeObject(StringBuilder out, Map<?, ?> map, boolean pretty, int indent) {
        out.append('{');
        if (!map.isEmpty()) {
            int index = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (index++ > 0) {
                    out.append(',');
                }
                newline(out, pretty, indent + 1);
                writeString(out, String.valueOf(entry.getKey()));
                out.append(pretty ? ": " : ":");
                writeValue(out, entry.getValue(), pretty, indent + 1);
            }
            newline(out, pretty, indent);
        }
        out.append('}');
    }

    private static void writeArray(StringBuilder out, Collection<?> collection, boolean pretty, int indent) {
        out.append('[');
        if (!collection.isEmpty()) {
            int index = 0;
            for (Object item : collection) {
                if (index++ > 0) {
                    out.append(',');
                }
                newline(out, pretty, indent + 1);
                writeValue(out, item, pretty, indent + 1);
            }
            newline(out, pretty, indent);
        }
        out.append(']');
    }

    private static void newline(StringBuilder out, boolean pretty, int indent) {
        if (!pretty) {
            return;
        }
        out.append('\n');
        out.append("  ".repeat(Math.max(0, indent)));
    }

    private static void writeString(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
    }

    private static final class Parser {
        private final String text;
        private int pos;

        private Parser(String text) {
            this.text = text;
        }

        private Object parse() {
            Object value = readValue();
            skipWhitespace();
            if (pos != text.length()) {
                throw error("Caractere inattendu apres la fin du JSON.");
            }
            return value;
        }

        private Object readValue() {
            skipWhitespace();
            if (pos >= text.length()) {
                throw error("Fin de JSON inattendue.");
            }
            char c = text.charAt(pos);
            return switch (c) {
                case '{' -> readObject();
                case '[' -> readArray();
                case '"' -> readString();
                case 't' -> readLiteral("true", Boolean.TRUE);
                case 'f' -> readLiteral("false", Boolean.FALSE);
                case 'n' -> readLiteral("null", null);
                default -> {
                    if (c == '-' || Character.isDigit(c)) {
                        yield readNumber();
                    }
                    throw error("Valeur JSON inattendue.");
                }
            };
        }

        private Map<String, Object> readObject() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            skipWhitespace();
            if (peek('}')) {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                String key = readString();
                skipWhitespace();
                expect(':');
                map.put(key, readValue());
                skipWhitespace();
                if (peek('}')) {
                    pos++;
                    return map;
                }
                expect(',');
            }
        }

        private List<Object> readArray() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skipWhitespace();
            if (peek(']')) {
                pos++;
                return list;
            }
            while (true) {
                list.add(readValue());
                skipWhitespace();
                if (peek(']')) {
                    pos++;
                    return list;
                }
                expect(',');
            }
        }

        private String readString() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (pos < text.length()) {
                char c = text.charAt(pos++);
                if (c == '"') {
                    return out.toString();
                }
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (pos >= text.length()) {
                    throw error("Sequence d'echappement incomplete.");
                }
                char escaped = text.charAt(pos++);
                switch (escaped) {
                    case '"' -> out.append('"');
                    case '\\' -> out.append('\\');
                    case '/' -> out.append('/');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> {
                        if (pos + 4 > text.length()) {
                            throw error("Sequence unicode incomplete.");
                        }
                        String hex = text.substring(pos, pos + 4);
                        out.append((char) Integer.parseInt(hex, 16));
                        pos += 4;
                    }
                    default -> throw error("Echappement JSON inconnu.");
                }
            }
            throw error("Chaine JSON non terminee.");
        }

        private Object readNumber() {
            int start = pos;
            if (peek('-')) {
                pos++;
            }
            while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                pos++;
            }
            boolean decimal = false;
            if (peek('.')) {
                decimal = true;
                pos++;
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                    pos++;
                }
            }
            if (peek('e') || peek('E')) {
                decimal = true;
                pos++;
                if (peek('+') || peek('-')) {
                    pos++;
                }
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                    pos++;
                }
            }
            String raw = text.substring(start, pos);
            if (decimal) {
                return new BigDecimal(raw).doubleValue();
            }
            try {
                return Long.parseLong(raw);
            } catch (NumberFormatException ignored) {
                return new BigDecimal(raw);
            }
        }

        private Object readLiteral(String literal, Object value) {
            if (!text.startsWith(literal, pos)) {
                throw error("Litteral JSON invalide.");
            }
            pos += literal.length();
            return value;
        }

        private void skipWhitespace() {
            while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) {
                pos++;
            }
        }

        private void expect(char expected) {
            if (pos >= text.length() || text.charAt(pos) != expected) {
                throw error("Caractere attendu: " + expected);
            }
            pos++;
        }

        private boolean peek(char expected) {
            return pos < text.length() && text.charAt(pos) == expected;
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " Position " + pos + ".");
        }
    }
}
