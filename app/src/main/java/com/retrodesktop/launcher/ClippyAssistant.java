package com.retrodesktop.launcher;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import javax.net.ssl.HttpsURLConnection;

final class ClippyAssistant {
    private static final String TAG = "ClippyAssistant";
    private static final String DOWNLOAD_URL = "https://huggingface.co/litert-community/Qwen3-0.6B/resolve/"
            + "8d42ab5f1db14cad987fac57aeb17d070f9e180d/"
            + "Qwen3-0.6B_dynamic_wi4b32_afp32.litertlm?download=true";
    private static final byte[] MAGIC = "LITERTLM".getBytes(StandardCharsets.US_ASCII);
    private static final long DOWNLOAD_BYTES = 343_490_560L;
    private static final byte[] DOWNLOAD_HASH = hashBytes("bf1aba9ce8d963124407353c6aa4cbf72eba78db21ae133de983eac672ce83e0");
    private static final long MAX_IMPORT_BYTES = 1_250_000_000L;
    private static final int MAX_QUESTION_LENGTH = 800;
    private static ClippyAssistant instance;

    private final Context context;
    private final File modelFile;
    private final File partialFile;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private Consumer<JSONObject> listener;
    private String job = "";
    private int progress;
    private String problem = "";
    // Only the model worker creates, uses, and releases the native engine.
    private ClippyModel model;
    private ScheduledFuture<?> unload;

    static synchronized ClippyAssistant get(Context context) {
        if (instance == null) instance = new ClippyAssistant(context.getApplicationContext());
        return instance;
    }

    private ClippyAssistant(Context context) {
        this.context = context;
        modelFile = new File(context.getFilesDir(), "clippy.litertlm");
        partialFile = new File(context.getFilesDir(), "clippy.litertlm.part");
    }

    void attach(Consumer<JSONObject> listener) {
        this.listener = listener;
        sendStatus();
    }

    void detach(Consumer<JSONObject> listener) {
        if (this.listener == listener) this.listener = null;
    }

    void sendStatus() {
        send("status", "", "");
    }

    void ask(String question) {
        String text = question.trim();
        if (text.isEmpty() || text.length() > MAX_QUESTION_LENGTH) return;
        if (!modelFile.isFile()) {
            problem = "Download or import an offline model to ask questions.";
            sendStatus();
            return;
        }
        run("answering", "Clippy couldn’t load the model or answer that question. Try again or replace the model.", () -> {
            if (model == null) model = new ClippyModel(modelFile, context.getCodeCacheDir());
            return model.answer(text);
        });
    }

    void assistMail(String request, String action, String subject, String body, Consumer<JSONObject> result) {
        if (!"summary".equals(action) && !"draft".equals(action)) return;
        if (!modelFile.isFile() || !job.isEmpty()) {
            result.accept(event("mail-answer", "", modelFile.isFile() ? "Clippy is busy. Try again in a moment."
                    : "Set up the offline model before using Clippy in mail.", request));
            return;
        }
        run("answering", "Clippy couldn’t help with this message. Try again in a moment.", request, result, () -> {
            if (model == null) model = new ClippyModel(modelFile, context.getCodeCacheDir());
            return model.answerMail(action, subject, body);
        });
    }

    void download() {
        if (modelFile.isFile()) return;
        run("downloading", "The download failed. Check your connection and available storage, then try again.", () -> {
            Files.deleteIfExists(partialFile.toPath());
            if (modelFile.getParentFile().getUsableSpace() < DOWNLOAD_BYTES + 32_000_000L) {
                throw new IOException("Insufficient storage for the offline model");
            }
            HttpsURLConnection connection = (HttpsURLConnection) new URL(DOWNLOAD_URL).openConnection();
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(25_000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "RetroDesktop98/1.6");
            try (InputStream stream = connection.getInputStream()) {
                install(stream, true);
            } finally {
                connection.disconnect();
            }
            return "";
        });
    }

    void importModel(Uri uri) {
        run("importing", "Couldn’t import this file. Select a LiteRT-LM (.litertlm) model.", () -> {
            Files.deleteIfExists(partialFile.toPath());
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new IOException("The file picker returned no model stream");
                install(stream, false);
            }
            return "";
        });
    }

    void remove() {
        run("removing", "Couldn’t remove the offline model.", () -> {
            releaseModel();
            model = null;
            Files.deleteIfExists(modelFile.toPath());
            Files.deleteIfExists(partialFile.toPath());
            return "";
        });
    }

    void clearHistory() {
        if (!job.isEmpty()) return;
        worker.execute(() -> {
            if (model != null) model.clearHistory();
        });
    }

    private void install(InputStream source, boolean verifyDownload) throws Exception {
        try {
            DataInputStream input = new DataInputStream(new BufferedInputStream(source));
            byte[] header = new byte[MAGIC.length];
            input.readFully(header);
            if (!Arrays.equals(header, MAGIC)) throw new IOException("Invalid LiteRT-LM header");
            MessageDigest digest = verifyDownload ? MessageDigest.getInstance("SHA-256") : null;
            if (digest != null) digest.update(header);
            long written = header.length;
            long limit = verifyDownload ? DOWNLOAD_BYTES : MAX_IMPORT_BYTES;
            int lastPercent = 0;
            try (FileOutputStream file = new FileOutputStream(partialFile);
                 BufferedOutputStream destination = new BufferedOutputStream(file)) {
                destination.write(header);
                byte[] buffer = new byte[128 * 1024];
                for (int count; (count = input.read(buffer)) != -1;) {
                    written += count;
                    if (written > limit) throw new IOException("Model exceeds the expected size");
                    if (digest != null) digest.update(buffer, 0, count);
                    destination.write(buffer, 0, count);
                    if (verifyDownload) {
                        int percent = (int) (written * 100 / DOWNLOAD_BYTES);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            main.post(() -> {
                                if ("downloading".equals(job)) {
                                    progress = percent;
                                    sendStatus();
                                }
                            });
                        }
                    }
                }
                destination.flush();
                file.getFD().sync();
            }
            if (digest != null && (written != DOWNLOAD_BYTES || !Arrays.equals(digest.digest(), DOWNLOAD_HASH))) {
                throw new IOException("Model download did not match the published checksum");
            }
            if (written <= 4096) throw new IOException("Model file is incomplete");
            releaseModel();
            model = null;
            Files.move(partialFile.toPath(), modelFile.toPath(), StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } finally {
            if (partialFile.exists() && !partialFile.delete()) Log.w(TAG, "Could not remove incomplete model file");
        }
    }

    private interface Operation {
        String perform() throws Exception;
    }

    private void run(String action, String failureMessage, Operation operation) {
        run(action, failureMessage, "", null, operation);
    }

    private void run(String action, String failureMessage, String request,
                     Consumer<JSONObject> resultTarget, Operation operation) {
        if (!job.isEmpty()) return;
        job = action;
        problem = "";
        progress = 0;
        sendStatus();
        worker.execute(() -> {
            if (unload != null) unload.cancel(false);
            String answer = "";
            String failure = "";
            try {
                answer = operation.perform();
            } catch (Exception | LinkageError | OutOfMemoryError error) {
                Log.w(TAG, "Clippy operation failed: " + action, error);
                releaseModel();
                failure = failureMessage;
            } finally {
                unload = worker.schedule(this::releaseModel, 90, TimeUnit.SECONDS);
            }
            String result = answer;
            String error = failure;
            main.post(() -> {
                job = "";
                problem = error;
                if ("answering".equals(action)) {
                    if (resultTarget == null) send("answer", result, error);
                    else resultTarget.accept(event("mail-answer", result, error, request));
                }
                sendStatus();
            });
        });
    }

    private void releaseModel() {
        if (model != null) {
            try {
                model.close();
            } catch (RuntimeException | LinkageError error) {
                Log.w(TAG, "Could not release the offline engine", error);
            }
        }
    }

    private void send(String type, String text, String error) {
        if (listener != null) listener.accept(event(type, text, error, ""));
    }

    private JSONObject event(String type, String text, String error, String request) {
        JSONObject state = new JSONObject();
        try {
            state.put("type", type).put("job", job).put("model", modelFile.isFile())
                    .put("progress", progress).put("problem", problem).put("text", text).put("error", error)
                    .put("request", request);
        } catch (JSONException failure) {
            throw new IllegalStateException(failure);
        }
        return state;
    }

    private static byte[] hashBytes(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }
}
