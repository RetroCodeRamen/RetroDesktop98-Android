package com.retrodesktop.launcher;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class LuaProjectZip {
    static final String PROJECT = "Project.luaform.json";
    private static final String IMAGE = "data:image/jpeg;base64,";

    static void write(File destination, JSONObject project) throws Exception {
        if (!"Retro Desktop 98 Lua Studio".equals(project.optString("format")) || project.optInt("version") != 2) {
            throw new IOException("Choose a valid Lua Studio project.");
        }
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(destination))) {
            add(zip, PROJECT, project.toString().getBytes(StandardCharsets.UTF_8));
            Set<String> paths = new HashSet<>();
            Set<String> assetFolders = new HashSet<>();
            JSONArray forms = project.getJSONArray("forms");
            for (int index = 0; index < forms.length(); index++) {
                JSONObject form = forms.getJSONObject(index);
                String name = identifier(form.getString("name"));
                addNamed(zip, paths, "Forms/" + name + ".lua", form.getString("code").getBytes(StandardCharsets.UTF_8));
                String assetFolder = name;
                for (int suffix = 2; !assetFolders.add(assetFolder.toLowerCase(Locale.ROOT)); suffix++) {
                    assetFolder = name + " (" + suffix + ")";
                }
                JSONArray controls = form.getJSONArray("controls");
                for (int number = 0; number < controls.length(); number++) {
                    JSONObject control = controls.getJSONObject(number);
                    String image = control.optString("image");
                    if (image.isEmpty()) continue;
                    if (!image.startsWith(IMAGE) || image.length() > 85_000) {
                        throw new IOException("A project picture is invalid.");
                    }
                    String controlName = identifier(control.getString("name"));
                    addNamed(zip, paths, "Assets/" + assetFolder + "/" + controlName + ".jpg",
                            Base64.decode(image.substring(IMAGE.length()), Base64.DEFAULT));
                }
            }
            JSONArray modules = project.getJSONArray("modules");
            for (int index = 0; index < modules.length(); index++) {
                JSONObject module = modules.getJSONObject(index);
                String path = "Modules/" + identifier(module.getString("name")) + ".lua";
                addNamed(zip, paths, path, module.getString("code").getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static String identifier(String name) throws IOException {
        if (!name.matches("[A-Za-z_][A-Za-z0-9_]{0,80}")) throw new IOException("An object has an invalid name.");
        return name;
    }

    private static void addNamed(ZipOutputStream zip, Set<String> paths, String path, byte[] bytes) throws IOException {
        // Lua identifiers are case-sensitive. Keep each exported file distinct on case-insensitive filesystems.
        String unique = path;
        int dot = path.lastIndexOf('.');
        for (int suffix = 2; !paths.add(unique.toLowerCase(Locale.ROOT)); suffix++) {
            unique = path.substring(0, dot) + " (" + suffix + ")" + path.substring(dot);
        }
        add(zip, unique, bytes);
    }

    private static void add(ZipOutputStream zip, String path, byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(path));
        zip.write(bytes);
        zip.closeEntry();
    }
}
