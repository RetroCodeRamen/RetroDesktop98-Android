package com.retrodesktop.launcher;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class MailAccountStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "RetroDesktop98.MailAccount";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private final AtomicFile file;

    MailAccountStore(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "mail-account.enc"));
    }

    MailProtocol.Account read() throws Exception {
        if (!file.getBaseFile().isFile()) return null;
        byte[] bytes = file.readFully();
        if (bytes.length <= IV_BYTES) throw new IllegalStateException("Incomplete encrypted account");
        Cipher decrypt = Cipher.getInstance(CIPHER);
        byte[] iv = Arrays.copyOf(bytes, IV_BYTES);
        decrypt.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
        byte[] decoded = decrypt.doFinal(bytes, IV_BYTES, bytes.length - IV_BYTES);
        return new MailProtocol.Account(new JSONObject(new String(decoded, StandardCharsets.UTF_8)));
    }

    void write(MailProtocol.Account account) throws Exception {
        Cipher encrypt = Cipher.getInstance(CIPHER);
        encrypt.init(Cipher.ENCRYPT_MODE, key(true));
        byte[] iv = encrypt.getIV();
        if (iv.length != IV_BYTES) throw new IllegalStateException("Unexpected encryption parameters");
        byte[] ciphertext = encrypt.doFinal(account.settings(true).toString().getBytes(StandardCharsets.UTF_8));
        FileOutputStream output = file.startWrite();
        try {
            output.write(iv);
            output.write(ciphertext);
            file.finishWrite(output);
        } catch (Exception error) {
            file.failWrite(output);
            throw error;
        }
    }

    void remove() {
        file.delete();
    }

    private static SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        SecretKey existing = (SecretKey) store.getKey(ALIAS, null);
        if (existing != null) return existing;
        if (!create) throw new IllegalStateException("Missing mail account encryption key");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }
}
