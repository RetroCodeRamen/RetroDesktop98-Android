package com.retrodesktop.launcher;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

final class WorkspaceFileOps {
    static File path(File root, File cwd, String argument) throws IOException {
        if (argument.length() > 4096) throw new IOException("This path is too long.");
        String value = argument.replace('\\', '/');
        if (value.length() >= 2 && value.charAt(1) == ':') {
            if (Character.toUpperCase(value.charAt(0)) != 'C') throw new IOException("Only drive C: is available.");
            value = value.substring(2);
        }
        File current = value.startsWith("/") ? root : cwd;
        for (String part : value.split("/")) {
            if (part.isEmpty() || ".".equals(part)) continue;
            if (!current.isDirectory()) throw new IOException("A folder in that path could not be found.");
            if ("..".equals(part)) {
                if (!current.equals(root)) current = current.getParentFile();
            } else current = child(current, part);
        }
        return current;
    }

    static File child(File parent, String name) throws IOException {
        File exact = new File(parent, ZipContents.component(name));
        if (!DesktopFileCatalog.visible(exact)) throw new IOException("That file or folder is unavailable.");
        if (exact.exists()) return exact;
        File[] matching = parent.listFiles(file -> file.getName().equalsIgnoreCase(name));
        if (matching == null || matching.length == 0) return exact;
        if (matching.length > 1 || !DesktopFileCatalog.visible(matching[0])) {
            throw new IOException("Use the exact name of that file or folder.");
        }
        return matching[0];
    }

    static File requireFile(File file) throws IOException {
        if (!file.isFile()) throw new IOException("File not found.");
        return file;
    }

    static File requireDirectory(File file) throws IOException {
        if (!file.isDirectory()) throw new IOException("Folder not found.");
        return file;
    }

    static List<File> children(File directory) throws IOException {
        File[] entries = directory.listFiles(DesktopFileCatalog::visible);
        if (entries == null) throw new IOException("Could not read that folder.");
        Arrays.sort(entries, Comparator.comparing((File item) -> !item.isDirectory())
                .thenComparing(File::getName, String.CASE_INSENSITIVE_ORDER));
        return new ArrayList<>(Arrays.asList(entries));
    }

    static File mkdir(File target) throws IOException {
        synchronized (DesktopWorkspace.WRITE_LOCK) {
            File parent = requireDirectory(target.getParentFile());
            if (child(parent, target.getName()).exists()) throw new IOException("That name already exists.");
            Files.createDirectory(target.toPath());
            return target;
        }
    }

    static File transfer(File root, File source, File destination, boolean move) throws IOException {
        synchronized (DesktopWorkspace.WRITE_LOCK) {
            checkSource(root, source, move);
            File target = destination.isDirectory() ? child(destination, source.getName()) : destination;
            if (target.toPath().startsWith(source.toPath())) throw new IOException("Choose a destination outside the source.");
            if (target.exists()) throw new IOException("The destination already exists.");
            if (move) Files.move(source.toPath(), target.toPath());
            else {
                File stage = Files.createTempDirectory(target.getParentFile().toPath(), ".workspace-").toFile();
                File payload = new File(stage, "payload");
                try {
                    copy(source, payload, new CopyBudget(), 0);
                    Files.move(payload.toPath(), target.toPath());
                } finally {
                    DesktopWorkspace.removeTree(stage);
                }
            }
            return target;
        }
    }

    static File rename(File root, File source, String name) throws IOException {
        synchronized (DesktopWorkspace.WRITE_LOCK) {
            checkSource(root, source, true);
            File matched = child(source.getParentFile(), name);
            File target = new File(source.getParentFile(), name);
            if (matched.exists() && !matched.equals(source)) throw new IOException("That name already exists.");
            if (!source.equals(target)) Files.move(source.toPath(), target.toPath());
            return target;
        }
    }

    private static void checkSource(File root, File source, boolean move) throws IOException {
        if (source.equals(root) || (!source.isFile() && !source.isDirectory()) || !DesktopFileCatalog.visible(source)) {
            throw new IOException("Source file or folder not found.");
        }
        if (move && root.equals(source.getParentFile()) && DesktopWorkspace.BUILT_INS.contains(source.getName())) {
            throw new IOException("The launcher uses that folder as a default location.");
        }
    }

    private static void copy(File source, File output, CopyBudget budget, int depth) throws IOException {
        if (!DesktopFileCatalog.visible(source) || ++budget.entries > ZipContents.MAX_ENTRIES || depth > ZipContents.MAX_DEPTH) {
            throw new IOException("The source contains unsupported files or too many levels.");
        }
        if (source.isDirectory()) {
            Files.createDirectory(output.toPath());
            for (File child : children(source)) copy(child, new File(output, child.getName()), budget, depth + 1);
        } else if (source.isFile()) {
            try (InputStream in = Files.newInputStream(source.toPath()); OutputStream out = Files.newOutputStream(output.toPath())) {
                budget.bytes += ZipContents.copy(in, out, ZipContents.MAX_BYTES - budget.bytes);
            }
            output.setLastModified(source.lastModified());
        } else throw new IOException("The source file is unavailable.");
    }

    private static final class CopyBudget {
        int entries;
        long bytes;
    }
}
