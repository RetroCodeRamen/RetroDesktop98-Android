package com.retrodesktop.launcher;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.text.Collator;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Executor;

final class DesktopArchives {
    static final String ZIP = "application/zip";
    private static final int PICK_ARCHIVE = 38;
    private final DesktopActivity activity;
    private final DesktopDocuments documents;
    private final Executor worker;
    private final File cache;
    private ZipContents contents;
    private ZipContents.Item current;
    private File archive;
    private String token;
    private String title;
    private File location;

    DesktopArchives(DesktopActivity activity, DesktopDocuments documents, Executor worker) {
        this.activity = activity;
        this.documents = documents;
        this.worker = worker;
        cache = activity.getCacheDir();
    }

    static boolean isZip(String name, String type) {
        return name.toLowerCase(Locale.ROOT).endsWith(".zip") || ZIP.equalsIgnoreCase(type)
                || "application/x-zip-compressed".equalsIgnoreCase(type);
    }

    // Called on the storage worker, including when a ZIP is opened from Explorer or Mail.
    void open(InputStream stream, String name, File preferredFolder) {
        File next = null;
        try {
            purgeOldArchives();
            next = File.createTempFile("view-zip-", ".zip", cache);
            try (OutputStream output = Files.newOutputStream(next.toPath())) {
                ZipContents.copy(stream, output, ZipContents.MAX_ARCHIVE_BYTES);
            }
            ZipContents incoming = new ZipContents(next);
            clear();
            contents = incoming;
            archive = next;
            current = contents.root;
            token = UUID.randomUUID().toString();
            title = name;
            location = preferredFolder;
            publish(true);
        } catch (Exception error) {
            if (next != null && next != archive) next.delete();
            documents.report("", false, "", detail(error, "Could not read this ZIP archive."));
        }
    }

    void command(String action, String id, String data) {
        if ("open-zip".equals(action)) {
            activity.pickForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), PICK_ARCHIVE, "No Android file picker is available.");
            return;
        }
        if (data.length() > 24_000) return;
        worker.execute(() -> {
            if (contents == null || !id.equals(token)) return;
            try {
                switch (action) {
                    case "zip-close": clear(); break;
                    case "zip-up":
                        if (current.parent != null) current = current.parent;
                        publish(false);
                        break;
                    case "zip-entry":
                        ZipContents.Item item = currentChild(data);
                        if (item == null) return;
                        if (item.directory()) {
                            current = item;
                            publish(false);
                        } else if (isZip(item.name, "")) {
                            throw new IOException("Extract this ZIP before opening it.");
                        } else openEntry(item);
                        break;
                    case "zip-project":
                        if (contents.project() != null) documents.openLuaArchive(contents);
                        break;
                    case "zip-extract":
                        extractSelection(data);
                        break;
                }
            } catch (Exception error) {
                documents.report("", false, "", detail(error, "Could not use this ZIP archive."));
            }
        });
    }

    boolean onResult(int request, int result, Intent data) {
        Uri uri = result == Activity.RESULT_OK && data != null ? data.getData() : null;
        if (request == PICK_ARCHIVE) {
            if (uri != null) worker.execute(() -> {
                try (InputStream input = documents.input(uri)) {
                    open(input, DesktopDocuments.name(documents.displayName(uri, "Archive.zip")), null);
                } catch (IOException | RuntimeException error) {
                    documents.report("", false, "", "Could not open this ZIP archive.");
                }
            });
        } else return false;
        return true;
    }

    private ZipContents.Item currentChild(String id) {
        ZipContents.Item item = contents.item(id);
        return item != null && item.parent == current ? item : null;
    }

    private void openEntry(ZipContents.Item entry) throws IOException {
        File file = File.createTempFile("zip-entry-", ".tmp", cache);
        try {
            try (OutputStream output = Files.newOutputStream(file.toPath())) {
                contents.write(entry, output, 64L * 1024 * 1024);
            }
            String name = DesktopDocuments.name(entry.name);
            Uri uri = AttachmentProvider.stage(activity, file, name, typeFor(name));
            documents.open(uri, name);
        } finally {
            file.delete();
        }
    }

    private void extractSelection(String selected) throws Exception {
        List<ZipContents.Item> items = new ArrayList<>();
        if (selected.isEmpty()) items.addAll(contents.root.children.values());
        else {
            JSONArray request = new JSONArray(selected);
            for (int index = 0; index < request.length(); index++) {
                ZipContents.Item item = currentChild(request.getString(index));
                if (item == null) throw new IOException("Choose items in the current folder.");
                if (!items.contains(item)) items.add(item);
            }
        }
        if (items.isEmpty()) throw new IOException("This ZIP is empty.");
        File parent = location == null ? DesktopWorkspace.folder(activity, DesktopWorkspace.DOCUMENTS) : location;
        File work = Files.createTempDirectory(parent.toPath(), ".extract-").toFile();
        String filename = DesktopDocuments.name(title.replaceFirst("(?i)\\.zip$", ""));
        File destination = null;
        try {
            for (ZipContents.Item item : items) extract(item, work);
            destination = DesktopWorkspace.publishFolder(parent, work, filename);
            documents.report("", true, "", "Extracted to " + parent.getName() + " / " + destination.getName() + ".");
            activity.refreshFileListing();
        } finally {
            if (destination == null) DesktopWorkspace.removeTree(work);
        }
    }

    private void extract(ZipContents.Item item, File parent) throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new IOException("ZIP extraction was interrupted.");
        File target = new File(parent, item.name);
        if (item.directory()) {
            Files.createDirectory(target.toPath());
            for (ZipContents.Item child : item.children.values()) extract(child, target);
        } else {
            try (OutputStream out = Files.newOutputStream(target.toPath(), java.nio.file.StandardOpenOption.CREATE_NEW)) {
                contents.write(item, out, ZipContents.MAX_BYTES);
            }
        }
    }

    private void publish(boolean show) throws Exception {
        List<ZipContents.Item> children = new ArrayList<>(current.children.values());
        Collator order = Collator.getInstance();
        children.sort((a, b) -> a.directory() == b.directory() ? order.compare(a.name, b.name) : (a.directory() ? -1 : 1));
        JSONArray rows = new JSONArray();
        for (ZipContents.Item item : children) {
            rows.put(new JSONObject().put("id", item.id).put("name", item.name).put("folder", item.directory())
                    .put("zip", !item.directory() && isZip(item.name, "")));
        }
        JSONObject snapshot = new JSONObject().put("show", show).put("id", token).put("title", title)
                .put("destination", location == null ? DesktopWorkspace.DOCUMENTS : location.getName())
                .put("path", current.path()).put("up", current.parent != null).put("entries", rows)
                .put("hasFiles", !contents.root.children.isEmpty()).put("project", contents.project() != null);
        activity.runOnUiThread(() -> activity.sendObject("archiveState", snapshot));
    }

    private void clear() {
        if (contents != null) {
            try { contents.close(); } catch (IOException ignored) { }
        }
        contents = null;
        current = null;
        if (archive != null) archive.delete();
        archive = null;
    }

    void close() { worker.execute(this::clear); }

    private void purgeOldArchives() {
        File[] files = cache.listFiles((directory, name) -> name.startsWith("view-zip-") && name.endsWith(".zip"));
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 60 * 60 * 1000L;
        for (File file : files) if (!file.equals(archive) && file.lastModified() < cutoff) file.delete();
    }

    static String typeFor(String name) {
        int dot = name.lastIndexOf('.');
        String extension = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
        String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return type == null ? "application/octet-stream" : type;
    }

    static String detail(Exception error, String fallback) {
        if (error instanceof IOException && !(error instanceof java.util.zip.ZipException)
                && error.getMessage() != null && error.getMessage().matches("[A-Z][^/\\\\\\n]{5,130}[.]")) return error.getMessage();
        return fallback;
    }
}
