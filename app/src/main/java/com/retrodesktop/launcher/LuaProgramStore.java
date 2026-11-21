package com.retrodesktop.launcher;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.UUID;

final class LuaProgramStore {
    private static final String PREFIX = "lua-user-";
    private static final int MAX_PROGRAMS = 24;
    private static final int MAX_TOTAL_CHARS = 1_600_000;
    private static final int MAX_PROGRAM_CHARS = LuaStudioRuntime.MAX_PAYLOAD - 16_000;
    private static final Object LOCK = new Object();

    private final SharedPreferences programs;

    LuaProgramStore(Context context) {
        this(context.getSharedPreferences("retro-lua-programs", Context.MODE_PRIVATE));
    }

    LuaProgramStore(SharedPreferences programs) {
        this.programs = programs;
    }

    String list() {
        synchronized (LOCK) {
            JSONArray catalog = new JSONArray();
            for (Map.Entry<String, ?> entry : programs.getAll().entrySet()) {
                if (!valid(entry.getKey()) || !(entry.getValue() instanceof String)) continue;
                try {
                    JSONObject published = new JSONObject((String) entry.getValue());
                    String name = published.getString("name");
                    JSONObject meta = published.optJSONObject("meta");
                    catalog.put(identity(entry.getKey(), name,
                        meta == null ? "1.0.0" : meta.optString("version", "1.0.0"),
                        meta == null ? "" : meta.optString("description", "")));
                } catch (JSONException ignored) {
                    // Skip malformed entries while keeping the rest of Programs available.
                }
            }
            return catalog.toString();
        }
    }

    String read(String id) {
        if (!valid(id)) return "";
        synchronized (LOCK) { return programs.getString(id, ""); }
    }

    String publish(String id, String data) {
        if (id == null || data == null || data.length() > MAX_PROGRAM_CHARS ||
                (!id.isEmpty() && !valid(id))) return error("This Lua project is too large or has an invalid ID.");
        synchronized (LOCK) {
            try {
                JSONObject project = new JSONObject(data);
                JSONArray forms = project.optJSONArray("forms");
                JSONArray modules = project.optJSONArray("modules");
                String name = project.optString("name").trim();
                if (!"Retro Desktop 98 Lua Studio".equals(project.optString("format")) ||
                        project.optInt("version") != 2 || forms == null || forms.length() == 0 ||
                        modules == null || name.isEmpty() || name.length() > 70) {
                    return error("Choose a valid Lua Studio project.");
                }
                JSONObject meta = project.optJSONObject("meta");
                if (meta != null && (!meta.optString("version", "1.0.0").matches("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}") ||
                    meta.optString("description", "").length() > 160)) {
                    return error("Invalid application version or description.");
                }
                project.remove("_debug");
                project.put("name", name);
                String stored = project.toString();
                int total = stored.length();
                Map<String, ?> existing = programs.getAll();
                if (!id.isEmpty() && !existing.containsKey(id)) {
                    return error("This program was removed. Open your project file or publish a new copy.");
                }
                if (id.isEmpty() && existing.size() >= MAX_PROGRAMS) {
                    return error("Programs is full. Remove a published Lua program to add another.");
                }
                for (Map.Entry<String, ?> entry : existing.entrySet()) {
                    if (entry.getKey().equals(id) || !(entry.getValue() instanceof String)) continue;
                    String value = (String) entry.getValue();
                    total += value.length();
                    try {
                        if (new JSONObject(value).optString("name").equalsIgnoreCase(name)) {
                            return error("A published Lua program already uses that name.");
                        }
                    } catch (JSONException ignored) { }
                }
                if (total > MAX_TOTAL_CHARS) return error("The published Lua program collection is full.");
                if (id.isEmpty()) id = PREFIX + UUID.randomUUID().toString().replace("-", "");
                if (!programs.edit().putString(id, stored).commit()) return error("Couldn’t save the Lua program.");
                return identity(id, name,
                    meta == null ? "1.0.0" : meta.optString("version", "1.0.0"),
                    meta == null ? "" : meta.optString("description", "")).toString();
            } catch (JSONException error) {
                return error("Couldn’t read the Lua project.");
            }
        }
    }

    boolean remove(String id) {
        if (!valid(id)) return false;
        synchronized (LOCK) {
            return programs.contains(id) && programs.edit().remove(id).commit();
        }
    }

    static boolean valid(String id) {
        return id != null && id.matches(PREFIX + "[a-f0-9]{32}");
    }

    private static JSONObject identity(String id, String name, String version, String description) throws JSONException {
        return new JSONObject().put("id", id).put("name", name)
            .put("version", version).put("description", description);
    }

    private static String error(String message) {
        try {
            return new JSONObject().put("error", message).toString();
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
