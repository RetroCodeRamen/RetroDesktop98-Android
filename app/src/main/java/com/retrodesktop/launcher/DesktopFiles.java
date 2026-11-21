package com.retrodesktop.launcher;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.text.Collator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class DesktopFiles {
    private static final String ID = DocumentsContract.Document.COLUMN_DOCUMENT_ID;
    private static final String NAME = DocumentsContract.Document.COLUMN_DISPLAY_NAME;
    private static final String TYPE = DocumentsContract.Document.COLUMN_MIME_TYPE;
    private static final String SIZE = DocumentsContract.Document.COLUMN_SIZE;
    private static final String MODIFIED = DocumentsContract.Document.COLUMN_LAST_MODIFIED;
    private static final String DIR = DocumentsContract.Document.MIME_TYPE_DIR;
    private final DesktopActivity activity;
    private final ContentResolver resolver;
    private final SharedPreferences preferences;
    private final DesktopDocuments documents;
    private final Executor worker;
    private final List<Entry> path = new ArrayList<>();
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private Uri tree;
    private File workspace;

    DesktopFiles(DesktopActivity activity, SharedPreferences preferences, DesktopDocuments documents, Executor worker) {
        this.activity = activity;
        this.resolver = activity.getContentResolver();
        this.preferences = preferences;
        this.documents = documents;
        this.worker = worker;
    }

    void selectRoot(Uri selected, int flags) {
        worker.execute(() -> {
            try {
                resolver.takePersistableUriPermission(selected, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Uri previous = DesktopWorkspace.tree(preferences);
                DesktopWorkspace.save(preferences, selected);
                if (!selected.equals(previous)) DesktopWorkspace.release(resolver, previous);
                showAndroid();
            } catch (Exception error) {
                failure("Could not open that Android folder.");
            }
        });
    }

    void command(String action, String id) {
        worker.execute(() -> {
            try {
                if (workspace == null) workspace = DesktopWorkspace.initialize(activity).getCanonicalFile();
                if (catalogAction(action, id)) return;
                switch (action) {
                    case "home": showWorkspace(""); break;
                    case "documents": showWorkspace(DesktopWorkspace.DOCUMENTS); break;
                    case "downloads": showWorkspace(DesktopWorkspace.DOWNLOADS); break;
                    case "pictures": showWorkspace(DesktopWorkspace.PICTURES); break;
                    case "recordings": showWorkspace(DesktopWorkspace.RECORDINGS); break;
                    case "projects": showWorkspace(DesktopWorkspace.LUA); break;
                    case "games": showWorkspace(DesktopWorkspace.DOS_GAMES); break;
                    default: if (path.isEmpty()) showWorkspace("");
                }
                if ("android".equals(action)) {
                    showAndroid();
                    return;
                }
                if ("up".equals(action) && path.size() > 1) path.remove(path.size() - 1);
                Entry entry = entries.get(id);
                if ("open".equals(action) && entry != null) {
                    if (entry.folder()) path.add(entry);
                    else {
                        documents.open(uri(entry), entry.name);
                        return;
                    }
                }
                if ("new-directory".equals(action) && tree == null) {
                    DesktopWorkspace.newFolder(current().file, DesktopDocuments.name(id));
                    publish("workspaceCatalogChanged", new JSONObject());
                }
                if (("share".equals(action) || "export-copy".equals(action)) && entry != null && !entry.folder()) {
                    sendCopy(entry, "share".equals(action));
                    return;
                }
                if ("zip-selection".equals(action) || "share-zip".equals(action)) {
                    createZip(id, "share-zip".equals(action));
                }
                list();
            } catch (Exception error) {
                failure(DesktopArchives.detail(error, "This folder or file is unavailable."));
            }
        });
    }

    private boolean catalogAction(String action, String argument) throws Exception {
        switch (action) {
            case "dos":
                dos(argument);
                return true;
            case "workspace-mutate":
                mutateWorkspace(argument);
                return true;
            case "tree":
                publish("fileTreeState", new JSONObject().put("key", argument)
                        .put("folders", DesktopFileCatalog.folders(workspace, argument)));
                return true;
            case "find": {
                JSONObject request = new JSONObject(argument);
                String query = request.getString("query");
                if (query.length() <= 100) publish("fileSearchState",
                        DesktopFileCatalog.search(workspace, query, request.getString("id")));
                return true;
            }
            case "recent":
                publish("fileRecentState", new JSONObject().put("entries", DesktopFileCatalog.recent(preferences, workspace)));
                return true;
            case "goto":
                openCatalog(argument, true);
                return true;
            case "open-catalog":
                openCatalog(argument, false);
                return true;
            case "preview": {
                Entry item = entries.get(argument);
                if (item != null && !item.folder()) documents.thumbnail(uri(item), item.name, argument);
                return true;
            }
            default: return false;
        }
    }

    private void dos(String argument) throws Exception {
        JSONObject request = new JSONObject(argument);
        String id = request.getString("id");
        String line = request.getString("line");
        String root = "";
        JSONObject result = new JSONObject().put("id", id).put("cwd", root).put("kind", request.optString("kind"));
        try {
            File current = DesktopFileCatalog.resolve(workspace, request.getString("cwd"));
            if (!current.isDirectory()) throw new IOException("That folder moved or is unavailable. Returned to C:.");
            result.put("cwd", DesktopFileCatalog.relative(workspace, current));
            if (line.length() > 1024) throw new IOException("This command is too long.");
            if ("complete".equals(request.optString("kind"))) {
                result.put("candidates", DesktopDos.complete(workspace, current, line));
            } else {
                DesktopDos.Result ran = DesktopDos.run(workspace, current, line,
                        file -> WorkspaceText.read(file).text, this::workspaceMoved);
                if (ran.edit != null) documents.openDosNote(workspace, ran.edit);
                if (ran.changed) refreshWorkspace();
                result.put("cwd", DesktopFileCatalog.relative(workspace, ran.cwd)).put("text", ran.text)
                        .put("clear", ran.clear).put("exit", ran.exit);
            }
        } catch (Exception error) {
            result.put("text", DesktopArchives.detail(error, "Could not complete that command."));
        }
        publish("dosResult", result);
    }

    private void mutateWorkspace(String argument) throws Exception {
        JSONObject request = new JSONObject(argument);
        JSONArray sources = request.getJSONArray("sources");
        String action = request.getString("action");
        JSONArray done = new JSONArray();
        JSONArray failed = new JSONArray();
        int size = Math.min(sources.length(), 100);
        for (int index = 0; index < size; index++) {
            String key = sources.getString(index);
            try {
                File source = DesktopFileCatalog.resolve(workspace, key);
                File target;
                if ("rename".equals(action)) target = WorkspaceFileOps.rename(workspace, source, request.getString("name"));
                else if ("move".equals(action) || "copy".equals(action)) {
                    File destination = DesktopFileCatalog.resolve(workspace, request.getString("destination"));
                    target = WorkspaceFileOps.transfer(workspace, source, WorkspaceFileOps.requireDirectory(destination),
                            "move".equals(action));
                } else throw new IOException("Unknown file operation.");
                if (!"copy".equals(action)) workspaceMoved(source, target);
                done.put(key);
            } catch (Exception error) {
                failed.put(new JSONObject().put("key", key)
                        .put("message", DesktopArchives.detail(error, "Could not change this file or folder.")));
            }
        }
        if (done.length() > 0) refreshWorkspace();
        publish("workspaceFileResult", new JSONObject().put("id", request.getString("id")).put("action", action)
                .put("done", done).put("failed", failed));
    }

    private void workspaceMoved(File source, File target) {
        DesktopFileCatalog.moved(preferences, workspace, source, target);
        String from = DesktopFileCatalog.relative(workspace, source);
        String to = DesktopFileCatalog.relative(workspace, target);
        activity.dosStoreMoved(from, to);
        try {
            publish("workspaceShortcutMoved", new JSONObject().put("from", from).put("to", to));
        } catch (org.json.JSONException ignored) { }
        if (tree != null || path.isEmpty() || !current().file.toPath().startsWith(source.toPath())) return;
        File moved = target.toPath().resolve(source.toPath().relativize(current().file.toPath())).toFile();
        showWorkspacePath(DesktopFileCatalog.relative(workspace, moved));
    }

    private void refreshWorkspace() {
        try {
            publish("workspaceCatalogChanged", new JSONObject());
            if (!path.isEmpty() && tree == null) list();
        } catch (Exception error) { failure("Refresh Explorer to see the updated workspace."); }
    }

    private void showWorkspacePath(String relative) {
        showWorkspace("");
        if (relative.isEmpty()) return;
        File part = workspace;
        for (String name : relative.split("/")) {
            part = new File(part, name);
            path.add(new Entry(part));
        }
    }

    private void openCatalog(String relative, boolean folderOnly) throws Exception {
        File file = DesktopFileCatalog.resolve(workspace.getCanonicalFile(), relative);
        if (file.isDirectory()) {
            showWorkspacePath(relative);
            list();
        } else if (!folderOnly && file.isFile()) documents.open(uri(new Entry(file)), file.getName());
        else throw new IOException("That file or folder is unavailable.");
    }

    private void sendCopy(Entry entry, boolean share) throws IOException {
        if (share && entry.file != null) {
            documents.share(uri(entry), entry.name, entry.type);
            return;
        }
        File staged = File.createTempFile("desktop-copy-", ".tmp", activity.getCacheDir());
        boolean handedOff = false;
        try (InputStream in = documents.input(uri(entry))) {
            try (java.io.OutputStream out = Files.newOutputStream(staged.toPath())) {
                ZipContents.copy(in, out, ZipContents.MAX_ARCHIVE_BYTES);
            }
            String name = DesktopDocuments.name(entry.name);
            if (share) documents.share(AttachmentProvider.stage(activity, staged, name, entry.type), name, entry.type);
            else documents.stageExport(staged, entry.type, name, "");
            handedOff = true;
        } finally {
            if (!handedOff) staged.delete();
        }
    }

    private void createZip(String payload, boolean share) throws Exception {
        JSONObject request = new JSONObject(payload);
        JSONArray ids = request.getJSONArray("items");
        if (ids.length() < 1 || ids.length() > ZipContents.MAX_ENTRIES) throw new IOException("Select files or folders first.");
        Map<String, Entry> selection = new LinkedHashMap<>();
        for (int index = 0; index < ids.length(); index++) {
            String id = ids.getString(index);
            Entry entry = entries.get(id);
            if (entry == null) throw new IOException("Select the items again before creating a ZIP.");
            selection.put(id, entry);
        }
        String name = DesktopDocuments.name(request.getString("name"));
        if (!name.toLowerCase(Locale.ROOT).endsWith(".zip")) name += ".zip";
        File staged = File.createTempFile("build-zip-", ".zip", activity.getCacheDir());
        try {
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(staged.toPath()))) {
                ZipBudget budget = new ZipBudget();
                for (Entry entry : selection.values()) writeZip(zip, entry, "", 1, budget);
            }
            try (ZipContents ignored = new ZipContents(staged)) {
                File folder = tree == null ? current().file : DesktopWorkspace.folder(activity, DesktopWorkspace.DOCUMENTS);
                File result = DesktopWorkspace.store(folder, staged, name);
                documents.report("", true, "", "Saved " + result.getName() + " in " + folder.getName() + ".");
                if (share) documents.share(uri(new Entry(result)), result.getName(), DesktopArchives.ZIP);
            }
        } finally {
            staged.delete();
        }
    }

    private void writeZip(ZipOutputStream out, Entry entry, String parent, int depth, ZipBudget budget) throws IOException {
        if (++budget.entries > ZipContents.MAX_ENTRIES || depth > ZipContents.MAX_DEPTH) {
            throw new IOException("The selection contains too many files or nested folders.");
        }
        String name = parent + ZipContents.component(entry.name);
        out.putNextEntry(new ZipEntry(name + (entry.folder() ? "/" : "")));
        if (!entry.folder()) {
            try (InputStream input = documents.input(uri(entry))) {
                budget.bytes += ZipContents.copy(input, out, ZipContents.MAX_BYTES - budget.bytes);
            }
        }
        out.closeEntry();
        if (entry.folder()) {
            for (Entry child : children(entry)) writeZip(out, child, name + "/", depth + 1, budget);
        }
    }

    private void showWorkspace(String folder) {
        tree = null;
        path.clear();
        entries.clear();
        path.add(new Entry(workspace, "Local Disk (C:)"));
        if (!folder.isEmpty()) path.add(new Entry(new File(workspace, folder)));
    }

    private void showAndroid() throws Exception {
        Uri selected = DesktopWorkspace.tree(preferences);
        if (selected == null) { list(); return; }
        Uri document = DesktopWorkspace.document(selected);
        String name;
        try (Cursor cursor = resolver.query(document, new String[]{NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new IOException("Choose the Android folder again to restore access.");
            name = cursor.getString(0);
        }
        path.clear();
        entries.clear();
        tree = selected;
        path.add(new Entry(DocumentsContract.getTreeDocumentId(tree), name, DIR));
        list();
    }

    private Entry current() { return path.get(path.size() - 1); }

    private Uri uri(Entry entry) throws IOException {
        return entry.file == null ? DocumentsContract.buildDocumentUriUsingTree(tree, entry.id) :
                AttachmentProvider.workspaceUri(activity, entry.file, entry.type);
    }

    private List<Entry> children(Entry directory) throws IOException {
        List<Entry> found = new ArrayList<>();
        if (directory.file != null) {
            File[] items = directory.file.listFiles(DesktopFileCatalog::visible);
            if (items == null) throw new IOException("This workspace folder is unavailable.");
            for (File file : items) found.add(new Entry(file));
        } else {
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, directory.id);
            try (Cursor cursor = resolver.query(children, new String[]{ID, NAME, TYPE, SIZE, MODIFIED}, null, null, null)) {
                if (cursor == null) throw new IOException("Choose the Android folder again to restore access.");
                int size = cursor.getColumnIndex(SIZE);
                int modified = cursor.getColumnIndex(MODIFIED);
                while (cursor.moveToNext()) {
                    if (cursor.getString(0) != null) found.add(new Entry(cursor.getString(0), cursor.getString(1), cursor.getString(2),
                            size >= 0 && !cursor.isNull(size) ? cursor.getLong(size) : -1,
                            modified >= 0 ? cursor.getLong(modified) : 0));
                }
            }
        }
        return found;
    }

    private void list() throws Exception {
        entries.clear();
        List<Entry> found = children(current());
        Collator names = Collator.getInstance();
        found.sort((first, second) -> first.folder() == second.folder()
                ? names.compare(first.name, second.name) : (first.folder() ? -1 : 1));
        for (Entry entry : found) {
            String key = entry.file == null ? tree.toString() + "/" + current().id + "/" + entry.id :
                    entry.file.getPath();
            entries.put(UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString(), entry);
        }
        publish(found.isEmpty() ? "This folder is empty." : "");
    }

    private void failure(String message) {
        documents.report("", false, "", message);
        if (!path.isEmpty()) {
            try { publish(message); } catch (Exception ignored) { }
        }
    }

    private void publish(String message) throws Exception {
        JSONArray rows = new JSONArray();
        for (Map.Entry<String, Entry> item : entries.entrySet()) {
            Entry entry = item.getValue();
            rows.put(new JSONObject().put("id", item.getKey()).put("name", entry.name)
                    .put("folder", entry.folder()).put("zip", DesktopArchives.isZip(entry.name, entry.type))
                    .put("size", entry.size).put("modified", entry.modified).put("type", entry.type)
                    .put("key", entry.file == null ? "" : DesktopFileCatalog.relative(workspace, entry.file)));
        }
        StringBuilder location = new StringBuilder();
        for (Entry entry : path) {
            if (location.length() != 0) location.append(" / ");
            location.append(entry.name);
        }
        boolean downloads = tree == null && path.size() == 2 && DesktopWorkspace.DOWNLOADS.equals(current().name);
        String key = tree == null ? DesktopFileCatalog.relative(workspace, current().file) : "";
        JSONObject payload = new JSONObject().put("path", tree == null ? DesktopFileCatalog.location(key) : location.toString())
                .put("up", path.size() > 1).put("key", key).put("message", message)
                .put("entries", rows).put("local", tree == null).put("downloads", downloads);
        publish("fileBrowserState", payload);
    }

    private void publish(String event, JSONObject payload) {
        activity.runOnUiThread(() -> activity.sendObject(event, payload));
    }

    private static final class ZipBudget {
        int entries;
        long bytes;
    }

    private static final class Entry {
        final String id;
        final String name;
        final String type;
        final File file;
        final long size;
        final long modified;

        Entry(File file) { this(file, file.getName()); }

        Entry(File file, String name) {
            this.file = file;
            id = "";
            this.name = name;
            type = file.isDirectory() ? DIR : DesktopArchives.typeFor(name);
            size = file.isFile() ? file.length() : -1;
            modified = file.lastModified();
        }

        Entry(String id, String name, String type) { this(id, name, type, -1, 0); }

        Entry(String id, String name, String type, long size, long modified) {
            this.id = id;
            this.name = name == null ? "Unnamed" : name;
            this.type = type == null || !type.contains("/") ? "application/octet-stream" : type;
            file = null;
            this.size = size;
            this.modified = modified;
        }

        boolean folder() { return DIR.equals(type); }
    }
}
