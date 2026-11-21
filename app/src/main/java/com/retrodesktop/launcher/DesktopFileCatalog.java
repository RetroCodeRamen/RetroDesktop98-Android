package com.retrodesktop.launcher;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

final class DesktopFileCatalog {
    private static final String RECENT = "recentWorkspace";
    private static final int RECENT_LIMIT = 12;
    private static final int SEARCH_LIMIT = 250;
    private static final int VISIT_LIMIT = 20_000;
    private static final Pattern STAGE = Pattern.compile("\\.(extract-[0-9]+|workspace-[0-9]+(?:\\.tmp)?)");

    static File resolve(File root, String relative) throws IOException {
        File file = root;
        if (!relative.isEmpty()) {
            if (relative.length() > 4096) throw new IOException("This path is too long.");
            for (String part : relative.split("/", -1)) {
                file = new File(file, ZipContents.component(part));
                if (!visible(file)) throw new IOException("That file or folder is unavailable.");
            }
        }
        File canonical = file.getCanonicalFile();
        if (!canonical.toPath().startsWith(root.getCanonicalFile().toPath()) || !visible(canonical)) {
            throw new IOException("That file or folder is unavailable.");
        }
        return canonical;
    }

    static String relative(File root, File item) {
        return root.toPath().relativize(item.toPath()).toString();
    }

    static String location(String relative) {
        return "C:\\" + relative.replace('/', '\\');
    }

    static boolean visible(File file) {
        return !STAGE.matcher(file.getName()).matches() && !Files.isSymbolicLink(file.toPath());
    }

    static JSONArray folders(File root, String relative) throws Exception {
        File[] items = resolve(root, relative).listFiles(file -> visible(file) && file.isDirectory());
        if (items == null) throw new IOException("This folder is unavailable.");
        Arrays.sort(items, Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER));
        JSONArray rows = new JSONArray();
        for (int index = 0; index < Math.min(items.length, 500); index++) {
            rows.put(new JSONObject().put("name", items[index].getName()).put("key", relative(root, items[index])));
        }
        return rows;
    }

    static JSONObject search(File root, String query, String request) throws Exception {
        JSONArray matches = new JSONArray();
        String needle = query.trim().toLowerCase(Locale.ROOT);
        ArrayDeque<File> directories = new ArrayDeque<>();
        directories.add(root);
        int visited = 0;
        boolean limited = false;
        while (!needle.isEmpty() && !directories.isEmpty() && !limited && !Thread.currentThread().isInterrupted()) {
            File[] files = directories.removeFirst().listFiles(DesktopFileCatalog::visible);
            if (files == null) continue;
            Arrays.sort(files, Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER));
            for (File item : files) {
                if (++visited > VISIT_LIMIT) {
                    limited = true;
                    break;
                }
                if (item.getName().toLowerCase(Locale.ROOT).contains(needle)) {
                    if (matches.length() >= SEARCH_LIMIT) {
                        limited = true;
                        break;
                    }
                    matches.put(item(root, item));
                }
                if (item.isDirectory()) directories.addLast(item);
            }
        }
        return new JSONObject().put("id", request).put("entries", matches).put("limited", limited);
    }

    private static JSONObject item(File root, File file) throws Exception {
        return new JSONObject().put("key", relative(root, file)).put("name", file.getName())
                .put("parent", location(relative(root, file.getParentFile()))).put("folder", file.isDirectory())
                .put("zip", DesktopArchives.isZip(file.getName(), ""));
    }

    static synchronized void remember(SharedPreferences preferences, File root, File file) {
        if (!file.isFile() || !visible(file)) return;
        String key = relative(root, file);
        JSONArray latest = new JSONArray().put(key);
        for (String saved : recentKeys(preferences)) {
            if (!key.equals(saved) && latest.length() < RECENT_LIMIT) latest.put(saved);
        }
        preferences.edit().putString(RECENT, latest.toString()).apply();
    }

    static synchronized void moved(SharedPreferences preferences, File root, File source, File target) {
        String from = relative(root, source);
        String to = relative(root, target);
        JSONArray updated = new JSONArray();
        for (String key : recentKeys(preferences)) {
            if (key.equals(from)) key = to;
            else if (key.startsWith(from + "/")) key = to + key.substring(from.length());
            updated.put(key);
        }
        preferences.edit().putString(RECENT, updated.toString()).apply();
    }

    static JSONArray recent(SharedPreferences preferences, File root) throws Exception {
        JSONArray rows = new JSONArray();
        for (String saved : recentKeys(preferences)) {
            try {
                File file = resolve(root, saved);
                if (file.isFile()) rows.put(item(root, file));
            } catch (IOException ignored) { }
        }
        return rows;
    }

    private static List<String> recentKeys(SharedPreferences preferences) {
        List<String> keys = new ArrayList<>();
        try {
            JSONArray values = new JSONArray(preferences.getString(RECENT, "[]"));
            for (int index = 0; index < Math.min(values.length(), RECENT_LIMIT); index++) {
                String value = values.optString(index);
                if (!value.isEmpty()) keys.add(value);
            }
        } catch (org.json.JSONException ignored) { }
        return keys;
    }
}
