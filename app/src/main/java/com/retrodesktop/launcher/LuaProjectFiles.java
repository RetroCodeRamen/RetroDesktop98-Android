package com.retrodesktop.launcher;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Comparator;

/**
 * A limited file API for published Lua apps, never exposed to the isolated Lua VM.
 * Paths are single filenames beneath C:\\Lua Projects\\AppData\\<program ID>.
 * All operations happen in this Android process, never in the isolated service.
 */
final class LuaProjectFiles {
    static final int MAX_BYTES = 16 * 1024;
    private static final int MAX_FILES = 32;
    private LuaProjectFiles() {}

    static boolean validName(String name) {
        return name != null && name.matches("[A-Za-z][A-Za-z0-9_-]{0,31}\\.(txt|csv|json)");
    }

    static JSONObject operate(Context context, String program, String action, String name, String text) {
        try {
            if (program == null || !program.matches("lua-user-[a-f0-9]{32}"))
                throw new IOException("Only published Lua programs have persistent files.");
            if (!Arrays.asList("read", "write", "list", "remove").contains(action))
                throw new IOException("Unknown file operation.");
            if (!"list".equals(action) && !validName(name))
                throw new IOException("Use a simple .txt, .csv, or .json filename.");
            File base = new File(DesktopWorkspace.folder(context, DesktopWorkspace.LUA), "AppData");
            File folder = new File(base, program).getCanonicalFile();
            if (!folder.toPath().startsWith(base.getCanonicalFile().toPath())) throw new IOException("Invalid app folder.");
            synchronized (DesktopWorkspace.WRITE_LOCK) {
                Files.createDirectories(folder.toPath());
                if (Files.isSymbolicLink(folder.toPath())) throw new IOException("Links are not supported.");
                if ("list".equals(action)) {
                    File[] files = folder.listFiles(file -> validName(file.getName()) && file.isFile() && !Files.isSymbolicLink(file.toPath()));
                    if (files == null) throw new IOException("Could not list app files.");
                    Arrays.sort(files, Comparator.comparing(File::getName));
                    JSONArray names = new JSONArray();
                    for (int i = 0; i < Math.min(files.length, MAX_FILES); i++) names.put(files[i].getName());
                    return new JSONObject().put("ok", true).put("text", String.join("\n", toStrings(names)));
                }
                File file = new File(folder, name).getCanonicalFile();
                if (!file.getParentFile().equals(folder) || Files.isSymbolicLink(file.toPath()))
                    throw new IOException("Invalid file location.");
                switch (action) {
                    case "read": {
                        if (!file.isFile()) throw new IOException("File not found: " + name);
                        if (file.length() > MAX_BYTES) throw new IOException("File is larger than 16 KiB.");
                        byte[] bytes = Files.readAllBytes(file.toPath());
                        return new JSONObject().put("ok", true).put("text", new String(bytes, StandardCharsets.UTF_8));
                    }
                    case "write": {
                        byte[] bytes = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
                        if (bytes.length > MAX_BYTES) throw new IOException("File is larger than 16 KiB.");
                        if (!file.exists()) {
                            File[] existing = folder.listFiles(current -> current.isFile());
                            if (existing == null || existing.length >= MAX_FILES) throw new IOException("App file limit reached (32).");
                        }
                        File temp = File.createTempFile(".lua-write-", ".tmp", folder);
                        try {
                            Files.write(temp.toPath(), bytes);
                            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
                        } finally { temp.delete(); }
                        return new JSONObject().put("ok", true);
                    }
                    case "remove": {
                        if (!file.isFile()) throw new IOException("File not found: " + name);
                        Files.delete(file.toPath());
                        return new JSONObject().put("ok", true);
                    }
                    default: throw new IOException("Unknown file operation.");
                }
            }
        } catch (Exception error) {
            try { return new JSONObject().put("ok", false).put("error",
                    LuaStudioRuntime.shorten(error.getMessage() == null ? "File operation failed." : error.getMessage(), 180)); }
            catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
        }
    }

    private static java.util.List<String> toStrings(JSONArray names) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (int i = 0; i < names.length(); i++) out.add(names.optString(i));
        return out;
    }
}
