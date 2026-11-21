package com.retrodesktop.launcher;

import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.URLUtil;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Executor;

final class DesktopDocuments {
    private static final int CREATE_FILE = 30;
    private static final int IMPORT_BACKUP = 31;
    private static final int PICK_IMAGE = 32;
    private static final int IMPORT_LUA = 33;
    private static final int IMPORT_LUA_SOURCE = 34;
    private static final int IMPORT_LUA_IMAGE = 35;
    private static final int IMPORT_WORDPAD = 36;
    private static final int IMPORT_WORKSPACE = 37;
    private static final int OPEN_ANSI = 39;
    private static final int MAX_ANSI = 512 * 1024;
    private static final int MAX_RTF = 780_000;
    private static final int MAX_BACKUP = 16 * 1024 * 1024;
    private static final int MAX_PNG = 6 * 1024 * 1024;
    private static final int MAX_ATTACHMENT = 12 * 1024 * 1024;
    private static final int MAX_IMAGE = 1200;
    private static final String FORMAT = "Retro Desktop 98";
    private final DesktopActivity activity;
    private final ContentResolver resolver;
    private final SharedPreferences preferences;
    private final DesktopWallpaper wallpaper;
    private final Executor worker;
    private final DesktopArchives archives;
    private static final Object DOWNLOAD_LOCK = new Object();

    // Pending document-picker exports survive Activity recreation.
    private Bundle pendingExport;
    // An import stays private until the desktop validates and confirms its layout.
    private JSONObject incomingBackup;
    private String backupToken;
    private Download pendingDownload;

    DesktopDocuments(DesktopActivity activity, SharedPreferences preferences, DesktopWallpaper wallpaper,
                     Executor worker, Bundle savedState) {
        this.activity = activity;
        this.resolver = activity.getContentResolver();
        this.preferences = preferences;
        this.wallpaper = wallpaper;
        this.worker = worker;
        this.archives = new DesktopArchives(activity, this, worker);
        pendingExport = savedState == null ? null : savedState.getBundle("desktopExport");
    }

    void close() { archives.close(); }

    void saveInstanceState(Bundle bundle) {
        if (pendingExport != null) bundle.putBundle("desktopExport", pendingExport);
    }

    void command(String action, String id, String data) {
        if ("open-zip".equals(action) || action.startsWith("zip-")) {
            archives.command(action, id, data);
            return;
        }
        switch (action) {
            case "export":
                if (data.length() < 2_000_000) worker.execute(() -> exportBackup(data));
                break;
            case "restore":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), IMPORT_BACKUP,
                        "No Android file picker is available.");
                break;
            case "apply-backup":
                if (data.length() < 2_000_000) worker.execute(() -> applyBackup(id, data));
                break;
            case "open-lua-project":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), IMPORT_LUA,
                        "No Android file picker is available.");
                break;
            case "import-lua-source":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), IMPORT_LUA_SOURCE,
                        "No Android file picker is available.");
                break;
            case "lua-image":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "image/*"), IMPORT_LUA_IMAGE,
                        "No Android image picker is available.");
                break;
            case "save-lua-project":
            case "export-lua-zip":
            case "export-lua":
                if (data.length() <= LuaStudioRuntime.MAX_PAYLOAD) {
                    worker.execute(() -> exportLua(action, id, data));
                } else report(id, false, "", "This Lua project is too large to save.");
                break;
            case "pick-image":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "image/*"), PICK_IMAGE,
                        "No Android image picker is available.");
                break;
            case "save-png":
                if (data.length() <= MAX_PNG * 2) worker.execute(() -> savePicture(id, data));
                else report(id, false, "", "This picture is too large to save.");
                break;
            case "paint-wallpaper":
                if (data.length() <= MAX_PNG * 2) worker.execute(() -> paintWallpaper(data));
                else report("", false, "", "This picture is too large to use as wallpaper.");
                break;
            case "open-wordpad":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), IMPORT_WORDPAD,
                        "No Android document picker is available.");
                break;
            case "import-workspace":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), IMPORT_WORKSPACE,
                        "No Android file picker is available.");
                break;
            case "save-wordpad":
                if (data.length() <= 1_560_000) worker.execute(() -> saveWordPad(id, data));
                else report(id, false, "", "This WordPad document is too large to save.");
                break;
            case "open-ansi":
                activity.pickForResult(picker(Intent.ACTION_OPEN_DOCUMENT, "*/*"), OPEN_ANSI,
                        "No Android file picker is available.");
                break;
            case "update-dos-note":
                if (data.length() <= 950_000) worker.execute(() -> updateDosNote(id, data));
                else report(id, false, "", "This text file is too large to save.");
                break;
            case "save-note":
                if (data.length() <= 950_000) worker.execute(() -> saveNote(id, data));
                else report(id, false, "", "This text file is too large to save.");
                break;
            case "downloads":
                worker.execute(this::listDownloads);
                break;
            case "open-download":
                worker.execute(() -> openDownload(id));
                break;
            case "download-confirm":
                if (pendingDownload != null && pendingDownload.id.equals(id)) {
                    Download download = pendingDownload;
                    pendingDownload = null;
                    worker.execute(() -> enqueue(download));
                }
                break;
        }
    }

    boolean onResult(int request, int result, Intent data) {
        if (archives.onResult(request, result, data)) return true;
        Uri uri = result == android.app.Activity.RESULT_OK && data != null ? data.getData() : null;
        if (request == CREATE_FILE) {
            Bundle operation = pendingExport;
            pendingExport = null;
            if (operation != null) worker.execute(() -> finishExport(operation, uri));
        } else if (request == IMPORT_BACKUP) {
            if (uri != null) worker.execute(() -> previewBackup(uri));
        } else if (request == IMPORT_LUA) {
            if (uri != null) worker.execute(() -> openLuaProject(uri));
        } else if (request == IMPORT_LUA_SOURCE) {
            if (uri != null) worker.execute(() -> openLuaSource(uri));
        } else if (request == IMPORT_LUA_IMAGE) {
            if (uri != null) worker.execute(() -> openLuaImage(uri));
        } else if (request == IMPORT_WORDPAD) {
            if (uri != null) worker.execute(() -> openWordPad(uri));
        } else if (request == IMPORT_WORKSPACE) {
            if (uri != null) worker.execute(() -> importWorkspaceFile(uri));
        } else if (request == OPEN_ANSI) {
            if (uri != null) worker.execute(() -> openPickedAnsi(uri));
        } else if (request == PICK_IMAGE) {
            if (uri != null) worker.execute(() -> open(uri, displayName(uri, "Picture"), "image/*"));
        } else {
            return false;
        }
        return true;
    }

    void open(Uri uri, String name) {
        worker.execute(() -> open(uri, name, ""));
    }

    private void open(Uri uri, String suggestedName, String fallbackType) {
        try {
            String name = name(suggestedName.isEmpty() ? displayName(uri, "Document") : suggestedName);
            String type = resolver.getType(uri);
            if (!fallbackType.isEmpty() && (type == null || "application/octet-stream".equals(type))) type = fallbackType;
            String lowerName = name.toLowerCase(Locale.ROOT);
            File file = AttachmentProvider.workspaceFile(activity, uri);
            if (file != null) DesktopFileCatalog.remember(preferences, DesktopWorkspace.root(activity).getCanonicalFile(), file);
            if (DesktopDosBox.isPackage(name) && (lowerName.endsWith(".jsdos") || lowerName.endsWith(".dosz") ||
                    (file != null && file.toPath().startsWith(new File(
                            DesktopWorkspace.root(activity).getCanonicalFile(), DesktopWorkspace.DOS_GAMES).toPath())))) {
                activity.openDosPackage(uri, name);
                return;
            }
            if (lowerName.endsWith(".ans")) {
                try (InputStream stream = input(uri)) { publishAnsi(name, stream); }
                return;
            }
            if (DesktopArchives.isZip(name, type)) {
                try (InputStream stream = input(uri)) {
                    archives.open(stream, name, file == null ? null : file.getParentFile());
                }
                return;
            }
            if (lowerName.endsWith(".luaform.json")) {
                openLuaProject(uri);
                return;
            }
            if (lowerName.endsWith(".lua")) {
                openLuaSource(uri);
                return;
            }
            if (isRtf(name, type)) {
                try (InputStream stream = input(uri)) { publishWordPad(name, stream, true, false); }
                return;
            }
            if (DesktopAudio.supports(type, name)) {
                activity.openAudioDocument(uri, name);
                return;
            }
            String kind = documentKind(type, name);
            if ("text".equals(kind)) {
                try (InputStream stream = input(uri)) { publishText(name, stream); }
            } else if ("image".equals(kind)) {
                publishPicture(name, () -> input(uri));
            } else {
                Intent view = viewIntent(uri, name, type);
                activity.runOnUiThread(() -> {
                    if (activity.isDesktopReady() && !activity.tryStart(view)) {
                        activity.message("No installed app can open this file.");
                    }
                });
            }
        } catch (Exception error) {
            report("", false, "", "Could not open this file.");
        }
    }

    void openAttachment(String name, String mimeType, File file, boolean save) {
        try {
            if (save) {
                storeWorkspace(file, DesktopWorkspace.DOWNLOADS, name, "");
                delete(file);
                return;
            }
            if (name.toLowerCase(Locale.ROOT).endsWith(".ans")) {
                try (InputStream stream = Files.newInputStream(file.toPath())) { publishAnsi(name, stream); }
                delete(file);
                return;
            }
            if (DesktopArchives.isZip(name, mimeType)) {
                try (InputStream stream = Files.newInputStream(file.toPath())) { archives.open(stream, name, null); }
                delete(file);
                return;
            }
            if (isRtf(name, mimeType)) {
                try (InputStream stream = Files.newInputStream(file.toPath())) {
                    publishWordPad(name, stream, true, false);
                }
                delete(file);
                return;
            }
            String kind = documentKind(mimeType, name);
            if ("text".equals(kind)) {
                try (InputStream stream = Files.newInputStream(file.toPath())) { publishText(name, stream); }
            } else if ("image".equals(kind)) {
                publishPicture(name, () -> Files.newInputStream(file.toPath()));
            } else {
                String type = safeMime(mimeType);
                Uri uri = AttachmentProvider.stage(activity, file, name, type);
                Intent view = viewIntent(uri, name, type);
                activity.runOnUiThread(() -> {
                    if (activity.isDesktopReady() && !activity.tryStart(view)) {
                        activity.message("No installed app can open this attachment. Use Save to keep a copy.");
                    }
                });
            }
        } catch (Exception error) {
            report("", false, "", "Could not open that attachment.");
        }
        delete(file);
    }

    private static Intent viewIntent(Uri uri, String name, String type) {
        Intent view = new Intent(Intent.ACTION_VIEW).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (type == null || type.isEmpty() || "*/*".equals(type)) view.setData(uri);
        else view.setDataAndType(uri, type);
        view.setClipData(ClipData.newRawUri(name, uri));
        return view;
    }

    private static String documentKind(String type, String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.matches(".*\\.(txt|log|md|csv|ini)$") || "text/plain".equals(type)) return "text";
        if (lower.matches(".*\\.(png|jpe?g|gif|webp|bmp)$") || ("image/*".equals(type) ||
                (type != null && type.matches("image/(png|jpeg|gif|webp|bmp|x-ms-bmp)")))) return "image";
        return "";
    }

    private void openPickedAnsi(Uri uri) {
        try (InputStream stream = input(uri)) {
            String title = displayName(uri, "Untitled.ans");
            if (!title.toLowerCase(Locale.ROOT).endsWith(".ans")) throw new IOException("Choose an .ANS file.");
            publishAnsi(title, stream);
        } catch (Exception error) {
            report("", false, "", DesktopArchives.detail(error, "Could not open this ANSI file."));
        }
    }

    private void publishAnsi(String name, InputStream stream) throws Exception {
        byte[] bytes = readLimited(stream, MAX_ANSI);
        publish("desktopAnsi", new JSONObject().put("name", name).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)));
    }

    void openDosNote(File root, File file) throws Exception {
        WorkspaceText document = WorkspaceText.read(file);
        DesktopFileCatalog.remember(preferences, root, file);
        publish("desktopText", new JSONObject().put("name", file.getName()).put("text", document.text)
                .put("key", DesktopFileCatalog.relative(root, file)).put("revision", document.revision));
    }

    private void updateDosNote(String request, String data) {
        try {
            JSONObject note = new JSONObject(data);
            File root = DesktopWorkspace.root(activity).getCanonicalFile();
            File file = DesktopFileCatalog.resolve(root, note.getString("key"));
            String revision = WorkspaceText.save(file, note.getString("revision"), note.getString("text"));
            publish("desktopFileResult", new JSONObject().put("id", request).put("ok", true).put("name", file.getName())
                    .put("revision", revision).put("message", "Saved " + file.getName() + "."));
            activity.refreshFileListing();
        } catch (Exception error) {
            report(request, false, "", DesktopArchives.detail(error, "Could not update this file. You can save a copy."));
        }
    }

    private void publishText(String name, InputStream stream) throws Exception {
        String text = decodeText(readLimited(stream, 620_000));
        if (text.length() > 150_000 || text.indexOf(0) != -1) throw new IOException("Unsupported text file");
        publish("desktopText", new JSONObject().put("name", name).put("text", text));
    }

    private static String decodeText(byte[] bytes) {
        Charset charset = StandardCharsets.UTF_8;
        int offset = 0;
        if (bytes.length >= 2 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xfe) {
            charset = StandardCharsets.UTF_16LE;
            offset = 2;
        } else if (bytes.length >= 2 && bytes[0] == (byte) 0xfe && bytes[1] == (byte) 0xff) {
            charset = StandardCharsets.UTF_16BE;
            offset = 2;
        } else if (bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf) {
            offset = 3;
        }
        return new String(bytes, offset, bytes.length - offset, charset);
    }

    private static boolean isRtf(String name, String media) {
        return name.toLowerCase(Locale.ROOT).endsWith(".rtf") ||
                "application/rtf".equalsIgnoreCase(media) || "text/rtf".equalsIgnoreCase(media) ||
                "application/x-rtf".equalsIgnoreCase(media);
    }

    private void openWordPad(Uri uri) {
        try (InputStream stream = input(uri)) {
            String file = displayName(uri, "Document");
            String media = resolver.getType(uri);
            publishWordPad(file, stream, isRtf(file, media),
                    "text/plain".equalsIgnoreCase(media) || file.toLowerCase(Locale.ROOT).endsWith(".txt"));
        } catch (Exception error) {
            report("", false, "", "Could not open this WordPad document. Choose an RTF or text file.");
        }
    }

    private void publishWordPad(String name, InputStream stream, boolean rich, boolean plain) throws Exception {
        byte[] bytes = readLimited(stream, MAX_RTF);
        int offset = bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb &&
                bytes[2] == (byte) 0xbf ? 3 : 0;
        String rtf = new String(bytes, offset, bytes.length - offset, StandardCharsets.ISO_8859_1);
        boolean header = rtf.startsWith("{\\rtf");
        if ((!rich && !plain && !header) || (rich && !header)) throw new IOException("Unsupported document format");
        String text = header ? rtf : decodeText(bytes);
        if (!header && (text.length() > 65_000 || text.indexOf(0) != -1)) throw new IOException("Unsupported text file");
        publish("wordDocumentOpened", new JSONObject().put("name", name).put("text", text)
                .put("format", header ? "rtf" : "text"));
    }

    private void saveWordPad(String request, String data) {
        try {
            JSONObject document = new JSONObject(data);
            String rtf = document.getString("rtf");
            if (rtf.length() > MAX_RTF || !rtf.startsWith("{\\rtf") || !rtf.endsWith("}")) {
                throw new IOException("Invalid RTF document");
            }
            String base = name(document.optString("name", "Untitled.rtf"));
            if (!base.toLowerCase(Locale.ROOT).endsWith(".rtf")) base += ".rtf";
            saveWorkspaceBytes(request, DesktopWorkspace.DOCUMENTS, base, rtf.getBytes(StandardCharsets.US_ASCII));
        } catch (Exception error) {
            report(request, false, "", "Couldn’t write this WordPad document.");
        }
    }

    @FunctionalInterface
    private interface ReadImage {
        InputStream open() throws IOException;
    }

    void thumbnail(Uri uri, String name, String id) {
        try {
            if (!"image".equals(documentKind(resolver.getType(uri), name))) return;
            Bitmap bitmap = readPicture(() -> input(uri), 168);
            try {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 78, buffer)) return;
                publish("fileThumbnail", new JSONObject().put("id", id)
                        .put("image", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP)));
            } finally { bitmap.recycle(); }
        } catch (Exception ignored) { }
    }

    private Bitmap readPicture(ReadImage source, int dimension) throws IOException {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        byte[] input;
        try (InputStream stream = source.open()) { input = readLimited(stream, MAX_ATTACHMENT); }
        BitmapFactory.decodeByteArray(input, 0, input.length, options);
        if (options.outWidth < 1 || options.outHeight < 1) throw new IOException("Not an image");
        options.inJustDecodeBounds = false;
        options.inSampleSize = 1;
        while ((long) Math.max(options.outWidth, options.outHeight) > (long) dimension * options.inSampleSize) {
            options.inSampleSize *= 2;
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(input, 0, input.length, options);
        if (bitmap == null) throw new IOException("Invalid image");
        return bitmap;
    }

    private void publishPicture(String name, ReadImage source) throws Exception {
        Bitmap bitmap = readPicture(source, MAX_IMAGE);
        String encoded;
        try {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, buffer)) throw new IOException("Invalid image");
            encoded = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        } finally {
            bitmap.recycle();
        }
        activity.runOnUiThread(() -> activity.sendDesktopImage(name, encoded));
    }

    private void openLuaProject(Uri uri) {
        try (BufferedInputStream stream = new BufferedInputStream(input(uri))) {
            stream.mark(4);
            boolean archive = stream.read() == 'P' && stream.read() == 'K';
            stream.reset();
            if (archive) {
                File file = File.createTempFile("lua-project-", ".zip", activity.getCacheDir());
                try {
                    try (OutputStream output = Files.newOutputStream(file.toPath())) {
                        ZipContents.copy(stream, output, ZipContents.MAX_ARCHIVE_BYTES);
                    }
                    try (ZipContents zip = new ZipContents(file)) { openLuaArchive(zip); }
                } finally { delete(file); }
            } else publishLuaProject(readLimited(stream, LuaStudioRuntime.MAX_PAYLOAD * 3));
        } catch (Exception error) {
            report("", false, "", "Could not open this Lua Studio project.");
        }
    }

    void openLuaArchive(ZipContents zip) throws Exception {
        ZipContents.Item project = zip.project();
        if (project == null) throw new IOException("This ZIP does not contain a Lua Studio project.");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        zip.write(project, output, LuaStudioRuntime.MAX_PAYLOAD * 3);
        publishLuaProject(output.toByteArray());
    }

    private void publishLuaProject(byte[] bytes) throws Exception {
        String data = new String(bytes, StandardCharsets.UTF_8);
        if (data.length() > LuaStudioRuntime.MAX_PAYLOAD) throw new IOException("Project is too large");
        publish("luaProjectOpened", new JSONObject().put("project", new JSONObject(data)));
    }

    private void openLuaSource(Uri uri) {
        try (InputStream stream = input(uri)) {
            String source = new String(readLimited(stream, LuaStudioRuntime.MAX_SCRIPT * 3), StandardCharsets.UTF_8);
            if (source.startsWith("\ufeff")) source = source.substring(1);
            if (source.length() > LuaStudioRuntime.MAX_SCRIPT || source.indexOf(0) != -1) {
                throw new IOException("Expected a Lua text file");
            }
            publish("luaSourceOpened", new JSONObject().put("code", source));
        } catch (Exception error) {
            report("", false, "", "Could not open this Lua source file.");
        }
    }

    private void openLuaImage(Uri uri) {
        try {
            Bitmap bitmap = readPicture(() -> input(uri), 280);
            try {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 75, buffer) || buffer.size() > 62_000) {
                    throw new IOException("Image exceeds the project limit");
                }
                String image = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
                publish("luaImageOpened", new JSONObject().put("image", image));
            } finally {
                bitmap.recycle();
            }
        } catch (Exception error) {
            report("", false, "", "Could not import this image into Lua Studio.");
        }
    }

    private void exportLua(String action, String id, String data) {
        try {
            JSONObject request = new JSONObject(data);
            if ("export-lua".equals(action)) {
                String source = request.getString("code");
                if (source.length() > LuaStudioRuntime.MAX_SCRIPT) throw new IOException("Lua file is too large");
                saveWorkspaceBytes(id, DesktopWorkspace.LUA, name(request.optString("name", "Main.lua")),
                        source.getBytes(StandardCharsets.UTF_8));
            } else if ("export-lua-zip".equals(action)) {
                File staged = File.createTempFile("lua-bundle-", ".zip", activity.getCacheDir());
                try {
                    LuaProjectZip.write(staged, request);
                    try (ZipContents ignored = new ZipContents(staged)) {
                        storeWorkspace(staged, DesktopWorkspace.LUA, name(request.getString("name") + ".zip"), id);
                    }
                } finally { delete(staged); }
            } else {
                String file = name(request.getString("name") + ".luaform.json");
                byte[] project = request.toString().getBytes(StandardCharsets.UTF_8);
                saveWorkspaceBytes(id, DesktopWorkspace.LUA, file, project);
            }
        } catch (Exception error) {
            report(id, false, "", "Could not export the Lua project.");
        }
    }

    private void saveNote(String id, String data) {
        try {
            JSONObject note = new JSONObject(data);
            String text = note.getString("text");
            if (text.length() > 150_000) throw new IOException("Oversize document");
            saveWorkspaceBytes(id, DesktopWorkspace.DOCUMENTS, name(note.optString("name", "Untitled.txt")),
                    text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            report(id, false, "", "Could not save the text file.");
        }
    }

    private void savePicture(String id, String data) {
        try {
            JSONObject picture = new JSONObject(data);
            saveWorkspaceBytes(id, DesktopWorkspace.PICTURES, name(picture.getString("name")), readPng(picture.getString("image")));
        } catch (Exception error) {
            report(id, false, "", "Could not save the picture.");
        }
    }

    private void paintWallpaper(String data) {
        try {
            wallpaper.saveImage(readPng(data));
            String encoded = wallpaper.readEncoded();
            activity.runOnUiThread(() -> activity.showSelectedWallpaper(encoded));
            report("", true, "", "Picture set as desktop wallpaper.");
        } catch (Exception error) {
            report("", false, "", "Could not set the picture as wallpaper.");
        }
    }

    private static byte[] readPng(String data) throws IOException {
        String header = "data:image/png;base64,";
        if (!data.startsWith(header)) throw new IOException("Expected PNG");
        byte[] bytes = Base64.decode(data.substring(header.length()), Base64.NO_WRAP);
        if (bytes.length < 8 || bytes.length > MAX_PNG || bytes[0] != (byte) 137 ||
                bytes[1] != 'P' || bytes[2] != 'N' || bytes[3] != 'G') throw new IOException("Invalid PNG");
        return bytes;
    }

    private void exportBackup(String data) {
        try {
            String image = wallpaper.readEncoded();
            JSONObject backup = new JSONObject().put("format", FORMAT).put("version", 1)
                    .put("layout", new JSONObject(data)).put("wallpaper", image == null ? JSONObject.NULL : image);
            saveBytes("", "RetroDesktop98-backup.json", "application/json",
                    backup.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            report("", false, "", "Could not create the desktop backup.");
        }
    }

    private void previewBackup(Uri uri) {
        incomingBackup = null;
        backupToken = null;
        try (InputStream stream = input(uri)) {
            JSONObject backup = new JSONObject(new String(readLimited(stream, MAX_BACKUP), StandardCharsets.UTF_8));
            if (!FORMAT.equals(backup.optString("format")) || backup.optInt("version") != 1 ||
                    (!backup.isNull("wallpaper") && !(backup.opt("wallpaper") instanceof String))) {
                throw new IOException("Unsupported backup");
            }
            JSONObject layout = backup.getJSONObject("layout");
            if (layout.toString().length() >= 2_000_000) throw new IOException("Desktop layout is too large");
            backupToken = UUID.randomUUID().toString();
            incomingBackup = backup;
            publish("desktopBackupPreview", new JSONObject().put("layout", layout).put("token", backupToken));
        } catch (Exception error) {
            report("", false, "", "Select a valid Retro Desktop 98 backup file.");
        }
    }

    private void applyBackup(String token, String data) {
        if (!token.equals(backupToken) || incomingBackup == null) {
            report("", false, "", "Open the backup file again to restore it.");
            return;
        }
        final JSONObject backup = incomingBackup;
        incomingBackup = null;
        backupToken = null;
        String previousWallpaper = wallpaper.readEncoded();
        String previousLayout = preferences.getString("layout", "");
        boolean replacedWallpaper = false;
        try {
            JSONObject layout = new JSONObject(data);
            restoreWallpaper(backup.isNull("wallpaper") ? null : backup.getString("wallpaper"));
            replacedWallpaper = true;
            if (!preferences.edit().putString("layout", layout.toString()).commit()) {
                preferences.edit().putString("layout", previousLayout).commit();
                throw new IOException("Could not save desktop preferences");
            }
            String restored = wallpaper.readEncoded();
            activity.runOnUiThread(() -> {
                activity.showWallpaper(restored);
                activity.sendObject("desktopBackupApplied", layout);
            });
        } catch (Exception error) {
            if (replacedWallpaper) {
                try { restoreWallpaper(previousWallpaper); } catch (Exception ignored) { }
            }
            report("", false, "", "Could not restore the desktop backup.");
        }
    }

    private void restoreWallpaper(String encoded) throws IOException {
        if (encoded == null) wallpaper.remove();
        else wallpaper.restoreJpeg(Base64.decode(encoded, Base64.NO_WRAP));
    }

    private void saveWorkspaceBytes(String id, String folder, String name, byte[] bytes) throws IOException {
        File file = File.createTempFile("desktop-save-", ".tmp", activity.getCacheDir());
        try {
            Files.write(file.toPath(), bytes);
            storeWorkspace(file, folder, name, id);
        } finally { delete(file); }
    }

    private void importWorkspaceFile(Uri uri) {
        File stage = null;
        try (InputStream input = input(uri)) {
            stage = File.createTempFile("workspace-import-", ".tmp", activity.getCacheDir());
            try (OutputStream output = Files.newOutputStream(stage.toPath())) {
                ZipContents.copy(input, output, ZipContents.MAX_ARCHIVE_BYTES);
            }
            storeWorkspace(stage, DesktopWorkspace.DOCUMENTS, name(displayName(uri, "Document")), "");
        } catch (IOException | RuntimeException error) {
            report("", false, "", DesktopArchives.detail(error, "Could not copy this file to My Documents."));
        } finally { if (stage != null) delete(stage); }
    }

    private void storeWorkspace(File source, String folder, String name, String request) throws IOException {
        File saved = DesktopWorkspace.store(DesktopWorkspace.folder(activity, folder), source, name);
        workspaceSaved(request, saved, folder);
    }

    void workspaceSaved(String request, File saved, String folder) {
        report(request, true, saved.getName(), "Saved " + saved.getName() + " in " + folder + ".");
        activity.refreshFileListing();
    }

    void share(Uri uri, String name, String mime) {
        activity.runOnUiThread(() -> {
            if (!activity.isDesktopReady()) return;
            Intent send = new Intent(Intent.ACTION_SEND).setType(safeMime(mime))
                    .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(name, uri));
            if (!activity.tryStart(Intent.createChooser(send, "Share " + name))) {
                report("", false, "", "No Android app is available to share this file.");
            }
        });
    }

    private void saveBytes(String id, String name, String type, byte[] bytes) throws IOException {
        File file = File.createTempFile("desktop-export-", ".tmp", activity.getCacheDir());
        try {
            Files.write(file.toPath(), bytes);
            stageExport(file, type, name, id);
        } catch (IOException | RuntimeException error) {
            delete(file);
            throw error;
        }
    }

    void stageExport(File file, String type, String name, String id) {
        activity.runOnUiThread(() -> {
            if (!activity.isDesktopReady() || pendingExport != null) {
                delete(file);
                report(id, false, "", "Finish the open save dialog first.");
                return;
            }
            pendingExport = new Bundle();
            pendingExport.putString("file", file.getName());
            pendingExport.putString("id", id);
            pendingExport.putString("name", name);
            Intent create = picker(Intent.ACTION_CREATE_DOCUMENT, type).putExtra(Intent.EXTRA_TITLE, name);
            if (!activity.pickForResult(create, CREATE_FILE, "No file picker is available.")) {
                pendingExport = null;
                delete(file);
                report(id, false, "", "");
            }
        });
    }

    private void finishExport(Bundle operation, Uri uri) {
        File file = new File(activity.getCacheDir(), operation.getString("file", ""));
        String id = operation.getString("id", "");
        try {
            if (uri == null) {
                report(id, false, "", "");
                return;
            }
            try (InputStream source = Files.newInputStream(file.toPath());
                 OutputStream destination = resolver.openOutputStream(uri, "wt")) {
                if (destination == null) throw new IOException("No destination stream");
                byte[] bytes = new byte[8192];
                for (int count; (count = source.read(bytes)) != -1;) destination.write(bytes, 0, count);
            }
            String title = displayName(uri, operation.getString("name", "File"));
            report(id, true, title, "Saved " + title + ".");
        } catch (Exception error) {
            report(id, false, "", "Could not write the selected file.");
        } finally {
            delete(file);
        }
    }

    void offerDownload(String url, String userAgent, String disposition, String type) {
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) {
            report("", false, "", "This download needs an HTTP or HTTPS link.");
            return;
        }
        try {
            String filename = name(URLUtil.guessFileName(url, disposition, type));
            pendingDownload = new Download(UUID.randomUUID().toString(), uri, userAgent, safeMime(type), filename);
            activity.sendObject("desktopDownloadOffer", new JSONObject()
                    .put("id", pendingDownload.id).put("name", filename));
        } catch (Exception error) {
            report("", false, "", "Could not open this download.");
        }
    }

    private void enqueue(Download download) {
        try {
            File base = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (base == null) {
                throw new IOException("Download storage is unavailable");
            }
            File folder = new File(base, UUID.randomUUID().toString());
            if (!folder.mkdir()) throw new IOException("Could not create download directory");
            String path = folder.getName() + "/" + download.name;
            DownloadManager.Request request = new DownloadManager.Request(download.uri)
                    .setTitle(download.name).setMimeType(download.mime)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, path);
            if (download.userAgent != null && !download.userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", download.userAgent);
            }
            try {
                manager().enqueue(request);
            } catch (RuntimeException error) {
                folder.delete();
                throw error;
            }
            report("", true, "", "Download started. Find it in Windows Explorer → Downloads.");
            listDownloads();
        } catch (Exception error) {
            report("", false, "", "Could not start this download.");
        }
    }

    private DownloadManager manager() {
        return (DownloadManager) activity.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
    }

    private void listDownloads() {
        try (Cursor cursor = manager().query(new DownloadManager.Query())) {
            if (cursor == null) throw new IOException("No downloads list");
            JSONArray rows = new JSONArray();
            while (rows.length() < 500 && cursor.moveToNext()) {
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long id = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));
                String title = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE));
                if (status == DownloadManager.STATUS_SUCCESSFUL && storeDownload(id, name(title))) continue;
                String label = status == DownloadManager.STATUS_SUCCESSFUL ? "Ready"
                        : status == DownloadManager.STATUS_FAILED ? "Failed" : "Downloading…";
                rows.put(new JSONObject().put("id", cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)))
                        .put("name", title)
                        .put("ready", status == DownloadManager.STATUS_SUCCESSFUL).put("status", label));
            }
            publish("desktopDownloads", new JSONObject().put("entries", rows));
        } catch (Exception error) {
            report("", false, "", "Could not list downloads.");
        }
    }

    private boolean storeDownload(long id, String title) {
        synchronized (DOWNLOAD_LOCK) {
            String key = "workspaceDownload:" + id;
            if (preferences.getBoolean(key, false)) return true;
            Uri uri = manager().getUriForDownloadedFile(id);
            if (uri == null) return false;
            File staged = null;
            try (InputStream in = input(uri)) {
                staged = File.createTempFile("desktop-download-", ".tmp", activity.getCacheDir());
                try (OutputStream out = Files.newOutputStream(staged.toPath())) {
                    ZipContents.copy(in, out, ZipContents.MAX_ARCHIVE_BYTES);
                }
                DesktopWorkspace.store(DesktopWorkspace.folder(activity, DesktopWorkspace.DOWNLOADS), staged, title);
                preferences.edit().putBoolean(key, true).apply();
                activity.refreshFileListing();
                return true;
            } catch (Exception error) {
                return false;
            } finally {
                if (staged != null) delete(staged);
            }
        }
    }

    private void openDownload(String id) {
        if (!id.matches("[0-9]{1,18}")) return;
        try {
            long number = Long.parseLong(id);
            DownloadManager manager = manager();
            Uri uri = manager.getUriForDownloadedFile(number);
            if (uri == null) throw new IOException("Download not ready");
            open(uri, "", manager.getMimeTypeForDownloadedFile(number));
        } catch (Exception error) {
            report("", false, "", "This download is not available.");
        }
    }

    InputStream input(Uri uri) throws IOException {
        InputStream stream = resolver.openInputStream(uri);
        if (stream == null) throw new IOException("No document stream");
        return stream;
    }

    String displayName(Uri uri, String fallback) {
        try (Cursor cursor = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return fallback;
            return cursor.getString(0) == null ? fallback : cursor.getString(0);
        } catch (RuntimeException error) {
            return fallback;
        }
    }

    private static Intent picker(String action, String type) {
        return new Intent(action).addCategory(Intent.CATEGORY_OPENABLE).setType(type);
    }

    static byte[] readLimited(InputStream stream, int maximum) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int count; (count = stream.read(buffer)) != -1;) {
            if (bytes.size() + count > maximum) throw new IOException("File is too large");
            bytes.write(buffer, 0, count);
        }
        return bytes.toByteArray();
    }

    static String name(String value) {
        if (value == null) return "File";
        String clean = value.replaceAll("[\\p{Cntrl}/\\\\]", "_").trim();
        if (clean.isEmpty() || ".".equals(clean) || "..".equals(clean)) return "File";
        if (clean.length() <= 100) return clean;
        int dot = clean.lastIndexOf('.');
        String extension = dot >= clean.length() - 10 && dot > 0 ? clean.substring(dot) : "";
        return clean.substring(0, 100 - extension.length()) + extension;
    }

    private static String safeMime(String value) {
        return value != null && value.matches("[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+")
                ? value : "application/octet-stream";
    }

    private void publish(String target, JSONObject data) {
        activity.runOnUiThread(() -> activity.sendObject(target, data));
    }

    void report(String id, boolean ok, String name, String detail) {
        try {
            publish("desktopFileResult", new JSONObject().put("id", id).put("ok", ok)
                    .put("name", name).put("message", detail));
        } catch (org.json.JSONException ignored) { }
    }

    private static void delete(File file) {
        if (file.isFile()) file.delete();
    }

    private static final class Download {
        final String id;
        final Uri uri;
        final String userAgent;
        final String mime;
        final String name;

        Download(String id, Uri uri, String userAgent, String mime, String name) {
            this.id = id;
            this.uri = uri;
            this.userAgent = userAgent;
            this.mime = mime;
            this.name = name;
        }
    }
}
