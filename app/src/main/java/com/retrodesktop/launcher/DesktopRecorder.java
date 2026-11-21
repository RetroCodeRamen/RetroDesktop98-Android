package com.retrodesktop.launcher;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class DesktopRecorder {
    private static final AtomicBoolean CAPTURING = new AtomicBoolean();
    private static final Object DRAFT_LOCK = new Object();

    private final DesktopActivity activity;
    private final DesktopDocuments documents;
    private final File draft;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager audio;
    private final AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    private final AudioFocusRequest focus;

    private Capture capture;
    private Clip clip;
    private MediaPlayer preview;
    private File previewFile;
    private boolean audioFocus;
    private long previewGeneration;
    private boolean loaded;
    private boolean disposed;
    private String phase = "idle";
    private String problem = "";
    private String exportedSelection = "";
    private Uri exportedUri;

    DesktopRecorder(DesktopActivity activity, DesktopDocuments documents) {
        this.activity = activity;
        this.documents = documents;
        draft = new File(activity.getNoBackupFilesDir(), "sound-recorder.wav");
        audio = (AudioManager) activity.getSystemService(android.content.Context.AUDIO_SERVICE);
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes).setOnAudioFocusChangeListener(change -> {
                    if (change < 0) stopPreview();
                }, main).build();
    }

    void command(String action, String data) {
        if (disposed) return;
        switch (action) {
            case "status": status(); break;
            case "stop": suspend(); break;
            case "new": discard(); break;
            case "preview":
            case "save":
            case "retroamp": actOnClip(action, data); break;
        }
    }

    void start() {
        if (disposed || capture != null || "working".equals(phase) || "loading".equals(phase)) return;
        stopPreview();
        if (!CAPTURING.compareAndSet(false, true)) {
            error("The microphone is already in use by Sound Recorder.");
            return;
        }
        Capture work = new Capture();
        capture = work;
        phase = "starting";
        problem = "";
        emit(null, 0);
        worker.execute(() -> record(work));
    }

    void permissionPrompt() {
        problem = "";
        phase = "permission";
        emit(clip, 0);
    }

    void error(String text) {
        if ("permission".equals(phase)) phase = clip == null ? "idle" : "ready";
        problem = text;
        emit(clip, 0);
    }

    void suspend() {
        if (capture != null) {
            capture.stop = true;
            phase = "finishing";
            emit(null, capture.lastDuration);
        }
        stopPreview();
    }

    void close() {
        suspend();
        disposed = true;
        worker.shutdown();
    }

    private void status() {
        boolean changed = ("idle".equals(phase) && draft.isFile()) ||
                ("ready".equals(phase) && !matchesDraft(clip));
        if ((loaded && !changed) || !("idle".equals(phase) || "ready".equals(phase))) {
            emit(capture == null ? clip : null, capture == null ? 0 : capture.lastDuration);
            return;
        }
        phase = "loading";
        emit(null, 0);
        worker.execute(() -> {
            Clip result = null;
            synchronized (DRAFT_LOCK) {
                try {
                    if (draft.isFile()) result = readDraft();
                } catch (IOException ignored) { }
            }
            Clip previous = result;
            main.post(() -> {
                if (disposed) return;
                loaded = true;
                clip = previous;
                phase = clip == null ? "idle" : "ready";
                emit(clip, 0);
            });
        });
    }

    private void discard() {
        if (capture != null || "working".equals(phase) || "loading".equals(phase)) return;
        stopPreview();
        problem = "";
        phase = "working";
        emit(clip, 0);
        Clip previous = clip;
        worker.execute(() -> {
            boolean cleared;
            synchronized (DRAFT_LOCK) {
                cleared = !draft.exists() || (matchesDraft(previous) && draft.delete());
            }
            main.post(() -> {
                if (disposed) return;
                if (cleared) clip = null;
                else problem = "Couldn’t clear the recording draft.";
                loaded = true;
                phase = clip == null ? "idle" : "ready";
                emit(clip, 0);
            });
        });
    }

    private void record(Capture run) {
        AudioRecord source = null;
        File temp = null;
        Clip recorded = null;
        String failure = "";
        try {
            if (run.stop) throw new IOException("Recording was stopped.");
            source = microphone();
            int rate = source.getSampleRate();
            temp = File.createTempFile("recorder-", ".wav", draft.getParentFile());
            source.startRecording();
            if (source.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IOException("The microphone could not start.");
            main.post(() -> {
                if (disposed || capture != run || run.stop) return;
                phase = "recording";
                emit(null, 0);
            });
            int total = 0;
            long lastUpdate = SystemClock.elapsedRealtime();
            long emptySince = lastUpdate;
            short[] samples = new short[2048];
            byte[] data = new byte[samples.length * 2];
            List<Integer> peakHistory = new ArrayList<>();
            try (BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temp))) {
                output.write(new byte[WavClip.HEADER]);
                int limit = rate * WavClip.MAX_SECONDS;
                while (!run.stop && total < limit) {
                    int count = source.read(samples, 0, Math.min(samples.length, limit - total), AudioRecord.READ_NON_BLOCKING);
                    if (count < 0) throw new IOException("Android stopped receiving microphone audio.");
                    if (count == 0) {
                        if (SystemClock.elapsedRealtime() - emptySince > 3000) throw new IOException("No audio reached the microphone.");
                        SystemClock.sleep(12);
                        continue;
                    }
                    emptySince = SystemClock.elapsedRealtime();
                    int peak = 0;
                    for (int index = 0; index < count; index++) {
                        short sample = samples[index];
                        data[2 * index] = (byte) sample;
                        data[2 * index + 1] = (byte) (sample >> 8);
                        peak = Math.max(peak, Math.abs((int) sample));
                    }
                    output.write(data, 0, count * 2);
                    total += count;
                    peakHistory.add(Math.min(100, peak * 100 / 32767));
                    if (SystemClock.elapsedRealtime() - lastUpdate >= 255) {
                        lastUpdate = SystemClock.elapsedRealtime();
                        int elapsed = (int) (total * 1000L / rate);
                        run.lastDuration = elapsed;
                        int[] peaks = liveWaveform(peakHistory);
                        main.post(() -> {
                            if (!disposed && capture == run && !run.stop) emitPeaks("", elapsed, peaks);
                        });
                    }
                }
            }
            if (total == 0) throw new IOException("No audio was captured.");
            releaseMicrophone(source);
            source = null;
            WavClip wav = new WavClip(rate, total);
            wav.finish(temp);
            int[] peaks = wav.waveform(temp);
            synchronized (DRAFT_LOCK) {
                Files.move(temp.toPath(), draft.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                recorded = new Clip(UUID.randomUUID().toString(), wav, peaks, draft.lastModified());
            }
        } catch (SecurityException error) {
            failure = "Allow microphone access to record.";
        } catch (RuntimeException error) {
            failure = "The microphone could not record audio.";
        } catch (IOException error) {
            failure = error.getMessage() == null ? "Couldn’t save the recording." : error.getMessage();
        } finally {
            releaseMicrophone(source);
            if (temp != null) temp.delete();
            CAPTURING.set(false);
        }
        Clip result = recorded;
        String reason = failure;
        main.post(() -> {
            if (disposed || capture != run) return;
            capture = null;
            loaded = true;
            if (result != null) {
                clip = result;
                exportedUri = null;
                exportedSelection = "";
            }
            phase = clip == null ? "idle" : "ready";
            problem = reason;
            emit(clip, 0);
        });
    }

    private static AudioRecord microphone() throws IOException {
        for (int rate : new int[]{44_100, 22_050, 16_000}) {
            int bytes = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (bytes <= 0) continue;
            try {
                AudioRecord record = new AudioRecord(MediaRecorder.AudioSource.MIC, rate,
                        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(8192, bytes * 2));
                if (record.getState() == AudioRecord.STATE_INITIALIZED) return record;
                releaseMicrophone(record);
            } catch (IllegalArgumentException | IllegalStateException ignored) {
                // Try another sample rate if the microphone rejects this one.
            }
        }
        throw new IOException("Android could not open a microphone on this device.");
    }

    private static void releaseMicrophone(AudioRecord source) {
        if (source == null) return;
        try {
            if (source.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) source.stop();
        } catch (RuntimeException ignored) { }
        try { source.release(); } catch (RuntimeException ignored) { }
    }

    private Clip readDraft() throws IOException {
        WavClip wav = WavClip.read(draft);
        return new Clip(UUID.randomUUID().toString(), wav, wav.waveform(draft), draft.lastModified());
    }

    private boolean matchesDraft(Clip expected) {
        return expected != null && draft.lastModified() == expected.modified &&
                draft.length() == WavClip.HEADER + expected.wav.frames * 2L;
    }

    private static int[] liveWaveform(List<Integer> input) {
        int[] peaks = new int[Math.min(WavClip.BINS, input.size())];
        for (int index = 0; index < input.size(); index++) {
            int cell = (int) (index * (long) peaks.length / input.size());
            peaks[cell] = Math.max(peaks[cell], input.get(index));
        }
        return peaks;
    }

    private void actOnClip(String action, String data) {
        if (clip == null || capture != null || "working".equals(phase) || "loading".equals(phase)) return;
        stopPreview();
        final int first;
        final int last;
        final String request;
        try {
            JSONObject options = new JSONObject(data);
            first = options.getInt("start");
            last = options.getInt("end");
            request = options.optString("request");
            if (first < 0 || last <= first || last > clip.wav.millis() ||
                    ("save".equals(action) && !request.matches("wave:[0-9]{1,16}"))) {
                throw new JSONException("Invalid range");
            }
        } catch (JSONException error) {
            error("Select a range of the recording first.");
            return;
        }
        long token = ++previewGeneration;
        String selection = clip.id + ":" + first + ":" + last;
        if ("retroamp".equals(action) && selection.equals(exportedSelection) && exportedUri != null && matchesDraft(clip)) {
            try (android.os.ParcelFileDescriptor file = activity.getContentResolver().openFileDescriptor(exportedUri, "r")) {
                if (file != null) {
                    activity.openAudioDocument(exportedUri, "Recording.wav");
                    return;
                }
            } catch (IOException | RuntimeException ignored) { }
        }
        problem = "";
        phase = "working";
        emit(clip, 0);
        Clip original = clip;
        worker.execute(() -> {
            File temp = null;
            try {
                temp = File.createTempFile("recording-export-", ".wav", activity.getCacheDir());
                synchronized (DRAFT_LOCK) {
                    if (!matchesDraft(original)) throw new IOException("Recording changed");
                    original.wav.slice(draft, temp, first, last);
                }
                File completed = temp;
                temp = null;
                if ("retroamp".equals(action)) {
                    temp = completed;
                    Uri uri = AttachmentProvider.stage(activity, completed, "Recording.wav", "audio/wav");
                    temp = null;
                    main.post(() -> {
                        if (disposed) return;
                        phase = "ready";
                        exportedSelection = selection;
                        exportedUri = uri;
                        emit(clip, 0);
                        activity.openAudioDocument(uri, "Recording.wav");
                    });
                } else if ("save".equals(action)) {
                    temp = completed;
                    File folder = DesktopWorkspace.folder(activity, DesktopWorkspace.RECORDINGS);
                    File saved = DesktopWorkspace.store(folder, completed, "Recording.wav");
                    completed.delete();
                    temp = null;
                    main.post(() -> {
                        if (disposed) return;
                        phase = "ready";
                        emit(clip, 0);
                        documents.workspaceSaved(request, saved, DesktopWorkspace.RECORDINGS);
                    });
                } else {
                    main.post(() -> deliverSlice(token, completed));
                }
            } catch (IOException | RuntimeException error) {
                if (temp != null) temp.delete();
                main.post(() -> {
                    if (disposed) return;
                    phase = "ready";
                    if (!matchesDraft(original)) {
                        status();
                        activity.message("The recording draft changed. The current clip has been reloaded.");
                    } else error("Couldn’t use this recording range.");
                    if ("save".equals(action)) documents.report(request, false, "", "");
                });
            }
        });
    }

    private void deliverSlice(long token, File completed) {
        if (disposed) { completed.delete(); return; }
        phase = "ready";
        if (token != previewGeneration || !activity.canPreviewRecording()) {
            completed.delete();
            emit(clip, 0);
        } else playSlice(completed);
    }

    private void playSlice(File file) {
        try {
            if (audio == null || audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                file.delete();
                error("Android audio is busy.");
                return;
            }
            audioFocus = true;
        } catch (RuntimeException error) {
            file.delete();
            error("Android audio is busy.");
            return;
        }
        previewFile = file;
        try {
            MediaPlayer media = new MediaPlayer();
            preview = media;
            media.setAudioAttributes(attributes);
            media.setDataSource(file.getAbsolutePath());
            media.setOnPreparedListener(ready -> {
                if (preview != ready) return;
                try { ready.start(); }
                catch (IllegalStateException error) { stopPreview(); error("Couldn’t play this recording."); }
            });
            media.setOnCompletionListener(complete -> { if (preview == complete) stopPreview(); });
            media.setOnErrorListener((failed, what, extra) -> {
                if (preview == failed) { stopPreview(); error("Couldn’t play this recording."); }
                return true;
            });
            media.prepareAsync();
            phase = "preview";
            emit(clip, 0);
        } catch (IOException | RuntimeException error) {
            stopPreview();
            error("Couldn’t play this recording.");
        }
    }

    private void stopPreview() {
        previewGeneration++;
        if (preview == null && previewFile == null && !audioFocus) return;
        if (preview != null) {
            preview.release();
            preview = null;
        }
        if (previewFile != null) previewFile.delete();
        previewFile = null;
        if (audioFocus && audio != null) audio.abandonAudioFocusRequest(focus);
        audioFocus = false;
        phase = clip == null ? "idle" : "ready";
        emit(clip, 0);
    }

    private void emit(Clip clip, int elapsed) {
        emitPeaks(clip == null ? "" : clip.id, clip == null ? elapsed : clip.wav.millis(), clip == null ? null : clip.peaks);
    }

    private void emitPeaks(String id, int duration, int[] peaks) {
        if (disposed) return;
        try {
            JSONArray levels = new JSONArray();
            if (peaks != null) for (int peak : peaks) levels.put(peak);
            activity.sendObject("recorderEvent", new JSONObject().put("phase", phase).put("problem", problem)
                    .put("id", id).put("duration", duration).put("peaks", levels));
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static final class Capture {
        volatile boolean stop;
        volatile int lastDuration;
    }

    private static final class Clip {
        final String id;
        final WavClip wav;
        final int[] peaks;
        final long modified;

        Clip(String id, WavClip wav, int[] peaks, long modified) {
            this.id = id;
            this.wav = wav;
            this.peaks = peaks;
            this.modified = modified;
        }
    }
}
