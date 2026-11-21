package com.retrodesktop.launcher;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.UUID;

public final class AttachmentProvider extends ContentProvider {
    private static final String CACHE_DIR = "opened-attachments";
    private static final long LIFETIME = 48L * 60 * 60 * 1000;

    static Uri stage(Context context, File source, String name, String type) throws IOException {
        File base = new File(context.getCacheDir(), CACHE_DIR);
        if (!base.isDirectory() && !base.mkdir() && !base.isDirectory()) throw new IOException("Attachment storage unavailable");
        File[] folders = base.listFiles();
        if (folders != null) {
            for (File folder : folders) {
                if (System.currentTimeMillis() - folder.lastModified() <= LIFETIME) continue;
                File[] contents = folder.listFiles();
                if (contents != null) {
                    for (File item : contents) item.delete();
                }
                folder.delete();
            }
        }
        File directory = new File(base, UUID.randomUUID().toString());
        if (!directory.mkdir()) throw new IOException("Attachment storage unavailable");
        try {
            Files.move(source.toPath(), new File(directory, name).toPath());
        } catch (IOException | RuntimeException error) {
            directory.delete();
            throw error;
        }
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".attachments")
                .appendPath(directory.getName()).appendPath(name).appendQueryParameter("type", type).build();
    }

    static Uri workspaceUri(Context context, File file, String type) throws IOException {
        File root = DesktopWorkspace.root(context).getCanonicalFile();
        String relative = root.toPath().relativize(file.getCanonicalFile().toPath()).toString();
        Uri.Builder uri = new Uri.Builder().scheme("content").authority(context.getPackageName() + ".attachments")
                .appendPath("workspace");
        for (String part : relative.split("/")) uri.appendPath(ZipContents.component(part));
        return uri.appendQueryParameter("type", type).build();
    }

    static File workspaceFile(Context context, Uri uri) {
        if (!"content".equals(uri.getScheme()) || !(context.getPackageName() + ".attachments").equals(uri.getAuthority())) {
            return null;
        }
        List<String> path = uri.getPathSegments();
        if (path.size() < 2 || !"workspace".equals(path.get(0))) return null;
        try {
            File root = DesktopWorkspace.root(context).getCanonicalFile();
            File file = root;
            for (int index = 1; index < path.size(); index++) file = new File(file, ZipContents.component(path.get(index)));
            File resolved = file.getCanonicalFile();
            return resolved.toPath().startsWith(root.toPath()) && resolved.isFile() ? resolved : null;
        } catch (IOException error) {
            return null;
        }
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        String type = uri.getQueryParameter("type");
        return type != null && type.matches("[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+")
                ? type : "application/octet-stream";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor result = new MatrixCursor(columns, 1);
        File file = find(uri);
        if (file == null) return result;
        MatrixCursor.RowBuilder row = result.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(file.getName());
            else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
            else row.add(null);
        }
        return result;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = find(uri);
        if (!"r".equals(mode) || file == null) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    private File find(Uri uri) {
        File workspace = workspaceFile(getContext(), uri);
        if (workspace != null) return workspace;
        List<String> path = uri.getPathSegments();
        if (path.size() != 2 || !path.get(0).matches("[0-9a-f-]{36}")
                || !path.get(1).equals(DesktopDocuments.name(path.get(1)))) return null;
        File base = new File(getContext().getCacheDir(), CACHE_DIR);
        File file = new File(new File(base, path.get(0)), path.get(1));
        return file.isFile() ? file : null;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) {
        throw new UnsupportedOperationException();
    }
}
