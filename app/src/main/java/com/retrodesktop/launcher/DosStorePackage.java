package com.retrodesktop.launcher;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.net.ssl.HttpsURLConnection;

final class DosStorePackage {
    private static final long ZIP_EPOCH = 315532800000L;

    static void download(String address, long size, String hash, File destination) throws IOException {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol())) throw new IOException("This game has an invalid download address.");
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(15_000);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            if (connection.getResponseCode() != 200) throw new IOException("The download server is unavailable.");
            try (InputStream source = connection.getInputStream()) {
                verify(source, size, hash, destination);
            }
        } finally {
            connection.disconnect();
        }
    }

    static void verify(InputStream source, long size, String hash, File destination) throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        DigestInputStream input = new DigestInputStream(source, digest);
        try (OutputStream output = Files.newOutputStream(destination.toPath())) {
            ZipContents.copy(input, output, size);
        }
        StringBuilder actual = new StringBuilder(64);
        for (byte value : digest.digest()) actual.append(String.format(Locale.ROOT, "%02x", value & 255));
        if (destination.length() != size || !hash.equals(actual.toString())) {
            throw new IOException("The download differs from the version tested for the DOSBox Store.");
        }
    }

    static void writeBundle(File source, File destination, String commands) throws IOException {
        try (ZipContents archive = new ZipContents(source);
             ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(destination.toPath()))) {
            if (archive.root.children.containsKey("start.bat")) {
                throw new IOException("This game package already has a startup script.");
            }
            writeChildren(archive, archive.root, output, "");
            entry(output, "START.BAT");
            output.write(("@ECHO OFF\n" + commands + "\n").replace("\n", "\r\n").getBytes(StandardCharsets.US_ASCII));
            output.closeEntry();
        }
    }

    private static void writeChildren(ZipContents archive, ZipContents.Item folder,
                                      ZipOutputStream output, String prefix) throws IOException {
        for (ZipContents.Item item : folder.children.values()) {
            String path = prefix + item.name;
            if (item.directory()) {
                entry(output, path + "/");
                output.closeEntry();
                writeChildren(archive, item, output, path + "/");
            } else {
                entry(output, path);
                archive.write(item, output, ZipContents.MAX_BYTES);
                output.closeEntry();
            }
        }
    }

    private static void entry(ZipOutputStream output, String name) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(ZIP_EPOCH);
        output.putNextEntry(entry);
    }
}
