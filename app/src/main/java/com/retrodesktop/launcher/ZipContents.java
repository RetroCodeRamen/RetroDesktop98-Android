package com.retrodesktop.launcher;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

final class ZipContents implements AutoCloseable {
    static final int MAX_ENTRIES = 3000;
    static final int MAX_DEPTH = 32;
    static final long MAX_BYTES = 256L * 1024 * 1024;
    static final long MAX_ARCHIVE_BYTES = MAX_BYTES + 4L * 1024 * 1024;
    final Item root = new Item("", "", null);
    final ZipFile file;
    private final Map<String, Item> items = new LinkedHashMap<>();

    ZipContents(File source) throws IOException {
        file = new ZipFile(source);
        try {
            if (file.size() > MAX_ENTRIES) throw new IOException("This ZIP contains too many files.");
            long bytes = 0;
            Enumeration<? extends ZipEntry> entries = file.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.isDirectory()) {
                    long size = entry.getSize();
                    if (size < 0 || size > MAX_BYTES - bytes) {
                        throw new IOException("This ZIP exceeds the 256 MB unpacked limit.");
                    }
                    bytes += size;
                }
                add(entry);
            }
        } catch (IOException | RuntimeException error) {
            file.close();
            throw error;
        }
    }

    private void add(ZipEntry entry) throws IOException {
        String name = entry.getName();
        if (entry.isDirectory()) name = name.substring(0, name.length() - 1);
        String[] parts = name.split("/", -1);
        if (parts.length > MAX_DEPTH) throw new IOException("This ZIP has too many nested folders.");
        Item current = root;
        for (int index = 0; index < parts.length; index++) {
            String part = component(parts[index]);
            boolean last = index == parts.length - 1;
            String key = part.toLowerCase(Locale.ROOT);
            Item next = current.children.get(key);
            boolean directory = !last || entry.isDirectory();
            if (next == null) {
                String id = Integer.toString(items.size() + 1);
                if (items.size() >= MAX_ENTRIES) throw new IOException("This ZIP contains too many files and folders.");
                next = new Item(id, part, current);
                current.children.put(key, next);
                items.put(id, next);
            } else if (!next.name.equals(part) || !next.directory() || !directory || (last && next.entry != null)) {
                throw new IOException("This ZIP has conflicting file or folder names.");
            }
            if (last) next.entry = entry;
            current = next;
        }
    }

    Item item(String id) {
        return id.isEmpty() ? root : items.get(id);
    }

    Item project() {
        Item item = root.children.get("project.luaform.json");
        return item != null && !item.directory() ? item : null;
    }

    void write(Item item, OutputStream output, long limit) throws IOException {
        if (item.directory() || item.entry.getSize() > limit) throw new IOException("This file is too large to open.");
        CRC32 crc = new CRC32();
        long size = 0;
        try (InputStream input = file.getInputStream(item.entry)) {
            byte[] buffer = new byte[16 * 1024];
            for (int count; (count = input.read(buffer)) != -1;) {
                size += count;
                if (size > item.entry.getSize()) throw new IOException("A ZIP entry has an invalid size.");
                crc.update(buffer, 0, count);
                output.write(buffer, 0, count);
            }
        }
        if (size != item.entry.getSize() || crc.getValue() != item.entry.getCrc()) {
            throw new IOException("A file in this ZIP is corrupt.");
        }
    }

    static String component(String name) throws IOException {
        if (name.isEmpty() || name.length() > 240 || name.equals(".") || name.equals("..") ||
                name.matches("(?s).*[\\\\/:\\p{Cntrl}].*")) {
            throw new IOException("This file or archive has an unsupported name.");
        }
        return name;
    }

    static long copy(InputStream input, OutputStream output, long limit) throws IOException {
        long size = 0;
        byte[] buffer = new byte[16 * 1024];
        for (int count; (count = input.read(buffer)) != -1;) {
            size += count;
            if (size > limit) throw new IOException("The selected files exceed the size limit for this operation.");
            output.write(buffer, 0, count);
        }
        return size;
    }

    @Override public void close() throws IOException { file.close(); }

    static final class Item {
        final String id;
        final String name;
        final Item parent;
        final Map<String, Item> children = new LinkedHashMap<>();
        ZipEntry entry;

        Item(String id, String name, Item parent) {
            this.id = id;
            this.name = name;
            this.parent = parent;
        }

        boolean directory() { return entry == null || entry.isDirectory(); }

        String path() {
            return parent == null || parent.parent == null ? name : parent.path() + " / " + name;
        }
    }
}
