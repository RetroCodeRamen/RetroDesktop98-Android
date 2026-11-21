package com.retrodesktop.launcher;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class DesktopWorkspace {
    static final String DOCUMENTS = "My Documents";
    static final String PICTURES = "My Pictures";
    static final String DOWNLOADS = "Downloads";
    static final String RECORDINGS = "Recordings";
    static final String LUA = "Lua Projects";
    static final String DOS_GAMES = "DOS Games";
    private static final String ANDROID_FOLDER = "filesTree";
    static final List<String> BUILT_INS = Collections.unmodifiableList(
            Arrays.asList(DOCUMENTS, PICTURES, DOWNLOADS, RECORDINGS, LUA, DOS_GAMES));
    static final Object WRITE_LOCK = new Object();

    static File root(Context context) {
        return new File(context.getNoBackupFilesDir(), "workspace");
    }

    static File initialize(Context context) throws IOException {
        File root = root(context);
        for (String name : BUILT_INS) {
            Files.createDirectories(new File(root, name).toPath());
        }
        return root;
    }

    static File folder(Context context, String name) throws IOException {
        return new File(initialize(context), name);
    }

    static File store(File parent, File source, String name) throws IOException {
        synchronized (WRITE_LOCK) {
            File destination = unused(parent, name);
            File stage = File.createTempFile(".workspace-", ".tmp", parent);
            try {
                Files.copy(source.toPath(), stage.toPath(), StandardCopyOption.REPLACE_EXISTING);
                Files.move(stage.toPath(), destination.toPath());
                return destination;
            } finally {
                stage.delete();
            }
        }
    }

    static File publishFolder(File parent, File source, String name) throws IOException {
        synchronized (WRITE_LOCK) {
            File destination = unused(parent, name);
            Files.move(source.toPath(), destination.toPath());
            return destination;
        }
    }

    static File newFolder(File parent, String name) throws IOException {
        synchronized (WRITE_LOCK) {
            File folder = unused(parent, name);
            Files.createDirectory(folder.toPath());
            return folder;
        }
    }

    private static File unused(File parent, String name) throws IOException {
        name = ZipContents.component(name.replace(':', '_'));
        File target = new File(parent, name);
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int index = 2; target.exists(); index++) {
            target = new File(parent, stem + " (" + index + ")" + extension);
        }
        return target;
    }

    static void removeTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTree(child);
        file.delete();
    }

    static Uri tree(SharedPreferences preferences) {
        String setting = preferences.getString(ANDROID_FOLDER, "");
        return setting.isEmpty() ? null : Uri.parse(setting);
    }

    static Uri document(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    static void release(ContentResolver resolver, Uri tree) {
        if (tree == null) return;
        for (UriPermission grant : resolver.getPersistedUriPermissions()) {
            if (!tree.equals(grant.getUri())) continue;
            int flags = (grant.isReadPermission() ? Intent.FLAG_GRANT_READ_URI_PERMISSION : 0) |
                    (grant.isWritePermission() ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
            try { resolver.releasePersistableUriPermission(tree, flags); }
            catch (SecurityException ignored) { }
            return;
        }
    }

    static void save(SharedPreferences preferences, Uri tree) {
        if (tree == null) preferences.edit().remove(ANDROID_FOLDER).apply();
        else preferences.edit().putString(ANDROID_FOLDER, tree.toString()).apply();
    }
}
