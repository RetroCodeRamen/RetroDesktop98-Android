package com.retrodesktop.launcher;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;

final class WorkspaceText {
    private static final int MAX_BYTES = 620_000;
    private static final int MAX_TEXT = 150_000;

    final String text;
    final String revision;
    private final Charset charset;
    private final byte[] bom;

    private WorkspaceText(byte[] bytes) throws IOException {
        charset = bytes.length >= 2 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xfe ? StandardCharsets.UTF_16LE :
                bytes.length >= 2 && bytes[0] == (byte) 0xfe && bytes[1] == (byte) 0xff ? StandardCharsets.UTF_16BE :
                StandardCharsets.UTF_8;
        int skip = !charset.equals(StandardCharsets.UTF_8) ? 2 :
                bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf ? 3 : 0;
        bom = Arrays.copyOf(bytes, skip);
        text = charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes, skip, bytes.length - skip)).toString();
        if (text.length() > MAX_TEXT || text.indexOf('\0') >= 0) throw new IOException("Choose a plain text file.");
        revision = hash(bytes);
    }

    static WorkspaceText read(File file) throws IOException {
        WorkspaceFileOps.requireFile(file);
        try (InputStream input = Files.newInputStream(file.toPath())) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int count; (count = input.read(buffer)) >= 0;) {
                if (bytes.size() + count > MAX_BYTES) throw new IOException("This text file is too large.");
                bytes.write(buffer, 0, count);
            }
            return new WorkspaceText(bytes.toByteArray());
        } catch (java.nio.charset.CharacterCodingException error) {
            throw new IOException("Choose a UTF-8 or UTF-16 plain text file.", error);
        }
    }

    static String save(File file, String revision, String text) throws IOException {
        if (text.length() > MAX_TEXT || text.indexOf('\0') >= 0) throw new IOException("This text file is too large or contains unsupported characters.");
        synchronized (DesktopWorkspace.WRITE_LOCK) {
            WorkspaceText before = read(file);
            if (!before.revision.equals(revision)) throw new IOException("The file changed. Reopen it or save a copy.");
            String ending = before.text.contains("\r\n") ? "\r\n" : before.text.indexOf('\n') == -1 &&
                    before.text.indexOf('\r') >= 0 ? "\r" : "\n";
            byte[] encoded = text.replace("\r\n", "\n").replace('\r', '\n').replace("\n", ending).getBytes(before.charset);
            byte[] bytes = Arrays.copyOf(before.bom, before.bom.length + encoded.length);
            System.arraycopy(encoded, 0, bytes, before.bom.length, encoded.length);
            File stage = File.createTempFile(".workspace-", ".tmp", file.getParentFile());
            try {
                Files.write(stage.toPath(), bytes);
                Files.move(stage.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
                return hash(bytes);
            } finally { stage.delete(); }
        }
    }

    private static String hash(byte[] bytes) {
        try { return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
