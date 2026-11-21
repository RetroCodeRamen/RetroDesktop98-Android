package com.retrodesktop.launcher;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class DesktopDosStore {
    private static final String INSTALL_PREFIX = "dosStore.";
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final DesktopActivity activity;
    private final SharedPreferences preferences;
    private final Map<String, JSONObject> games = new LinkedHashMap<>();
    private String downloading = "";
    private String status = "";

    DesktopDosStore(DesktopActivity activity, SharedPreferences preferences) {
        this.activity = activity;
        this.preferences = preferences;
        try (InputStream input = activity.getAssets().open("dos-store.json");
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            ZipContents.copy(input, bytes, 64 * 1024);
            JSONArray data = new JSONArray(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            for (int i = 0; i < data.length(); i++) {
                JSONObject game = data.getJSONObject(i);
                games.put(game.getString("id"), game);
            }
        } catch (IOException | JSONException error) {
            games.clear();
            status = "Could not open the DOSBox Store catalog.";
        }
    }

    void command(String action, String id) {
        if ("list".equals(action)) {
            publish();
            return;
        }
        JSONObject game = games.get(id);
        if (!"install".equals(action) || game == null || !game.has("zip") || !downloading.isEmpty()) return;
        if (!installed(id).isEmpty()) {
            publish();
            return;
        }
        String title = game.optString("title");
        downloading = id;
        status = "Downloading " + title + "…";
        publish();
        downloads.execute(() -> install(game, id, title));
    }

    private void install(JSONObject game, String id, String title) {
        File source = null;
        File bundle = null;
        String result;
        try {
            source = File.createTempFile("dos-store-source-", ".zip", activity.getCacheDir());
            bundle = File.createTempFile("dos-store-game-", ".zip", activity.getCacheDir());
            DosStorePackage.download(game.getString("zip"), game.getLong("size"), game.getString("sha256"), source);
            DosStorePackage.writeBundle(source, bundle, game.getString("start"));
            DesktopDosBox.checkBundle(bundle);
            File folder = DesktopWorkspace.folder(activity, DesktopWorkspace.DOS_GAMES);
            synchronized (DesktopWorkspace.WRITE_LOCK) {
                if (Thread.currentThread().isInterrupted()) return;
                File saved = DesktopWorkspace.store(folder, bundle, title + ".zip");
                preferences.edit().putString(INSTALL_PREFIX + id, DesktopWorkspace.DOS_GAMES + "/" + saved.getName()).apply();
            }
            result = title + " is ready to play offline.";
            activity.refreshFileListing();
        } catch (IOException | JSONException error) {
            result = DesktopArchives.detail(error, "Could not download " + title + ". Try again.");
        } finally {
            if (source != null) source.delete();
            if (bundle != null) bundle.delete();
        }
        String message = result;
        activity.runOnUiThread(() -> {
            downloading = "";
            status = message;
            publish();
        });
    }

    private String installed(String id) {
        String key = preferences.getString(INSTALL_PREFIX + id, "");
        if (key.isEmpty()) return "";
        try {
            File file = DesktopFileCatalog.resolve(DesktopWorkspace.root(activity), key);
            return file.isFile() ? key : "";
        } catch (IOException ignored) { return ""; }
    }

    void moved(String from, String to) {
        SharedPreferences.Editor editor = preferences.edit();
        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            if (!entry.getKey().startsWith(INSTALL_PREFIX) || !(entry.getValue() instanceof String)) continue;
            String key = (String) entry.getValue();
            if (key.equals(from) || key.startsWith(from + "/")) {
                editor.putString(entry.getKey(), to + key.substring(from.length()));
            }
        }
        editor.apply();
        activity.runOnUiThread(this::publish);
    }

    private void publish() {
        JSONArray rows = new JSONArray();
        try {
            for (JSONObject game : games.values()) {
                JSONObject row = new JSONObject();
                for (String field : new String[]{"id", "title", "genre", "edition", "description", "source", "gog", "size"}) {
                    if (game.has(field)) row.put(field, game.get(field));
                }
                row.put("key", installed(game.getString("id")));
                rows.put(row);
            }
            activity.sendObject("dosStoreState", new JSONObject().put("games", rows)
                    .put("downloading", downloading).put("status", status));
        } catch (JSONException error) { throw new IllegalStateException(error); }
    }

    void close() { downloads.shutdownNow(); }
}
