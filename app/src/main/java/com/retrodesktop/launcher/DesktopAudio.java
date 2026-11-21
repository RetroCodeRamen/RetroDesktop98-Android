package com.retrodesktop.launcher;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.OpenableColumns;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

final class DesktopAudio {
    private static final int MAX_TRACKS = 80;
    private static DesktopAudio instance;
    private final Context context;
    private final ContentResolver resolver;
    private final SharedPreferences settings;
    private final Handler work;
    private final AudioManager manager;
    private final AudioFocusRequest focusRequest;
    private final AudioAttributes attributes;
    private final DesktopSpectrum spectrum;
    private final Set<Consumer<JSONObject>> listeners = new LinkedHashSet<>();
    private final Set<Consumer<JSONObject>> meters = new HashSet<>();
    private final List<Track> tracks = new ArrayList<>();
    private MediaPlayer player;
    private Track selected;
    private String phase = "idle";
    private String problem = "";
    private String repeat = "off";
    private boolean focus;
    private boolean focusSuspended;
    private boolean seeking;
    private boolean playOnReady;
    private boolean resumeOnFocus;
    private int duration;
    private int position;
    private int volume = 75;

    private final Runnable tick = this::step;
    private final Runnable background = () -> {
        if (listeners.isEmpty() && ("playing".equals(phase) || "loading".equals(phase) || playOnReady || focus)) {
            pause(true);
        }
    };

    static synchronized DesktopAudio get(Context context) {
        if (instance == null) instance = new DesktopAudio(context.getApplicationContext());
        return instance;
    }

    private DesktopAudio(Context context) {
        this.context = context;
        resolver = context.getContentResolver();
        settings = context.getSharedPreferences("retro-audio", Context.MODE_PRIVATE);
        manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        HandlerThread thread = new HandlerThread("RetroAudio");
        thread.start();
        work = new Handler(thread.getLooper());
        spectrum = new DesktopSpectrum(context, work);
        attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes).setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(this::onFocus, work).build();
        work.post(this::load);
    }

    void attach(Consumer<JSONObject> listener) {
        work.post(() -> {
            work.removeCallbacks(background);
            listeners.add(listener);
            listener.accept(snapshot(true, null));
            if (playOnReady && "paused".equals(phase)) startReady();
            else schedule();
        });
    }

    void detach(Consumer<JSONObject> listener) {
        work.post(() -> {
            listeners.remove(listener);
            meters.remove(listener);
            if (meters.isEmpty()) spectrum.reset();
            if (listeners.isEmpty()) {
                work.removeCallbacks(tick);
                work.removeCallbacks(background);
                work.postDelayed(background, 1500);
            }
        });
    }

    void meter(Consumer<JSONObject> listener, boolean visible) {
        work.post(() -> {
            if (visible && listeners.contains(listener)) meters.add(listener);
            else meters.remove(listener);
            if (meters.isEmpty()) spectrum.reset();
            schedule();
        });
    }

    void add(List<Uri> input, int grantFlags, boolean openNow, String suppliedTitle) {
        work.post(() -> {
            Track first = null;
            boolean changed = false;
            boolean hitLimit = false;
            for (Uri uri : input) {
                if (!valid(uri)) continue;
                Track track = tracks.stream().filter(entry -> entry.uri.equals(uri)).findFirst().orElse(null);
                if (track == null) {
                    if (tracks.size() >= MAX_TRACKS) { hitLimit = true; break; }
                    int permission = persistPermission(uri, grantFlags);
                    String name = suppliedTitle.isEmpty() ? displayName(uri) : suppliedTitle;
                    track = new Track(UUID.randomUUID().toString(), uri, label(name), permission);
                    tracks.add(track);
                    changed = true;
                } else if (track.permission == 0) {
                    track.permission = persistPermission(uri, grantFlags);
                    changed |= track.permission != 0;
                }
                if (first == null) first = track;
            }
            problem = hitLimit ? "The playlist is full." : first == null ? "Choose an audio file." : "";
            if (changed) persist();
            // Send the updated list before the player emits loading events.
            publish(true, null);
            if (first != null && (openNow || selected == null)) begin(first);
        });
    }

    void command(String action, String data) {
        work.post(() -> {
            try {
                switch (action) {
                    case "status": publish(true, null); break;
                    case "play": play(); break;
                    case "pause": pause(true); break;
                    case "toggle": if ("playing".equals(phase) || playOnReady) pause(true); else play(); break;
                    case "stop": stop(); break;
                    case "next": advance(1, false); break;
                    case "previous":
                        if ("playing".equals(phase) && currentPosition() > 2600) seek(0);
                        else advance(-1, false);
                        break;
                    case "seek": seek(Integer.parseInt(data)); break;
                    case "track":
                        Track track = find(data);
                        if (track != null) begin(track);
                        break;
                    case "remove": remove(find(data)); break;
                    case "clear": clear(); break;
                    case "repeat":
                        repeat = "off".equals(repeat) ? "all" : "all".equals(repeat) ? "one" : "off";
                        persist();
                        publish(false, null);
                        break;
                    case "volume":
                        volume = Math.max(0, Math.min(100, Integer.parseInt(data)));
                        setVolume();
                        persist();
                        publish(false, null);
                        break;
                }
            } catch (IllegalArgumentException | IllegalStateException error) {
                fail("Playback couldn’t complete this action.");
            }
        });
    }

    private void play() {
        problem = "";
        if (selected == null) {
            if (!tracks.isEmpty()) begin(tracks.get(0));
            return;
        }
        if ("loading".equals(phase)) {
            playOnReady = true;
            publish(false, null);
        } else if (player == null || "ended".equals(phase) || "error".equals(phase)) {
            begin(selected);
        } else if (!"playing".equals(phase)) {
            startReady();
        }
    }

    private void begin(Track track) {
        discardPlayer();
        selected = track;
        playOnReady = true;
        resumeOnFocus = false;
        position = duration = 0;
        problem = "";
        phase = "loading";
        spectrum.setTrack(track.uri);
        persist();
        publish(false, null);
        MediaPlayer preparing = new MediaPlayer();
        player = preparing;
        try {
            preparing.setAudioAttributes(attributes);
            preparing.setDataSource(context, track.uri);
            preparing.setOnPreparedListener(ready -> {
                if (player != ready) return;
                duration = Math.max(0, ready.getDuration());
                phase = "paused";
                if (playOnReady) startReady();
                else publish(false, null);
            });
            preparing.setOnCompletionListener(complete -> {
                if (player != complete) return;
                phase = "ended";
                position = duration;
                advance(1, true);
            });
            preparing.setOnErrorListener((failed, what, extra) -> {
                if (player == failed) fail("This audio file couldn’t be played.");
                return true;
            });
            preparing.setOnSeekCompleteListener(seeked -> {
                if (player == seeked) {
                    seeking = false;
                    try { position = Math.max(0, seeked.getCurrentPosition()); } catch (IllegalStateException ignored) { }
                    publish(false, null);
                }
            });
            preparing.prepareAsync();
        } catch (IOException | RuntimeException error) {
            fail("Couldn’t open this audio file. Try adding it again.");
        }
    }

    private void startReady() {
        if (focusSuspended) {
            resumeOnFocus = true;
            playOnReady = false;
            problem = "Paused while Android is using audio.";
            publish(false, null);
            return;
        }
        if (listeners.isEmpty()) {
            playOnReady = true;
            return;
        }
        try {
            if (manager == null ||
                    (!focus && manager.requestAudioFocus(focusRequest) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED)) {
                phase = "paused";
                playOnReady = false;
                problem = "Audio is busy. Return to the launcher and press Play.";
                publish(false, null);
                return;
            }
            focus = true;
            problem = "";
            playOnReady = false;
            resumeOnFocus = false;
            setVolume();
            player.start();
            phase = "playing";
            publish(false, null);
            schedule();
        } catch (RuntimeException error) {
            fail("Couldn’t start playback.");
        }
    }

    private void pause(boolean releaseFocus) {
        playOnReady = false;
        if ("playing".equals(phase) && player != null) {
            position = currentPosition();
            try { player.pause(); }
            catch (IllegalStateException error) { fail("Couldn’t pause playback."); return; }
            phase = "paused";
        }
        if (releaseFocus) {
            resumeOnFocus = false;
            abandonFocus();
        }
        work.removeCallbacks(tick);
        spectrum.reset();
        publish(false, null);
    }

    private void seek(int value) {
        if (player == null || "loading".equals(phase) || duration <= 0) return;
        position = Math.max(0, Math.min(duration, value));
        seeking = true;
        player.seekTo(position, MediaPlayer.SEEK_CLOSEST);
        spectrum.reset();
        publish(false, null);
    }

    private void advance(int amount, boolean completed) {
        if (tracks.isEmpty()) return;
        if (completed && "one".equals(repeat) && selected != null) {
            begin(selected);
            return;
        }
        int current = tracks.indexOf(selected);
        int index = current < 0 ? 0 : current + amount;
        if ((index < 0 || index >= tracks.size()) && "all".equals(repeat)) {
            index = (index + tracks.size()) % tracks.size();
        }
        if (index >= 0 && index < tracks.size()) {
            begin(tracks.get(index));
        } else if (completed) {
            abandonFocus();
            spectrum.reset();
            publish(false, null);
        }
    }

    private void stop() {
        discardPlayer();
        abandonFocus();
        spectrum.reset();
        position = duration = 0;
        phase = selected == null ? "idle" : "stopped";
        problem = "";
        publish(false, null);
    }

    private void fail(String detail) {
        discardPlayer();
        abandonFocus();
        spectrum.reset();
        phase = "error";
        problem = detail;
        publish(false, null);
    }

    private void discardPlayer() {
        work.removeCallbacks(tick);
        playOnReady = resumeOnFocus = seeking = false;
        if (player != null) {
            player.release();
            player = null;
        }
    }

    private void onFocus(int change) {
        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            focusSuspended = false;
            if (resumeOnFocus && player != null && !listeners.isEmpty()) startReady();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
            pause(true);
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
                change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            if (focus) {
                focusSuspended = true;
                resumeOnFocus |= "playing".equals(phase) || playOnReady;
                pause(false);
            }
        }
    }

    private void abandonFocus() {
        if (focus && manager != null) manager.abandonAudioFocusRequest(focusRequest);
        focus = focusSuspended = false;
    }

    private int currentPosition() {
        if (!seeking && player != null && "playing".equals(phase)) {
            try { return Math.max(0, player.getCurrentPosition()); }
            catch (IllegalStateException ignored) { }
        }
        return position;
    }

    private void setVolume() {
        if (player == null || "loading".equals(phase)) return;
        float amplitude = volume / 100f;
        player.setVolume(amplitude, amplitude);
    }

    private void schedule() {
        work.removeCallbacks(tick);
        if (!listeners.isEmpty() && "playing".equals(phase)) work.postDelayed(tick, meters.isEmpty() ? 420 : 155);
    }

    private void step() {
        position = currentPosition();
        int[] bars = meters.isEmpty() ? null : spectrum.at(position);
        publish(false, bars);
        schedule();
    }

    private Track find(String id) {
        for (Track track : tracks) if (track.id.equals(id)) return track;
        return null;
    }

    private void remove(Track track) {
        if (track == null) return;
        if (selected == track) {
            selected = null;
            stop();
        }
        tracks.remove(track);
        releasePermission(track);
        persist();
        publish(true, null);
    }

    private void clear() {
        selected = null;
        stop();
        for (Track track : tracks) releasePermission(track);
        tracks.clear();
        persist();
        publish(true, null);
    }

    private void publish(boolean includeList, int[] bars) {
        if (listeners.isEmpty()) return;
        JSONObject state = snapshot(includeList, bars);
        for (Consumer<JSONObject> listener : listeners) listener.accept(state);
    }

    private JSONObject snapshot(boolean includeList, int[] levels) {
        try {
            JSONObject state = new JSONObject().put("phase", phase).put("problem", problem)
                    .put("id", selected == null ? "" : selected.id).put("title", selected == null ? "" : selected.title)
                    .put("position", currentPosition()).put("duration", duration)
                    .put("volume", volume).put("repeat", repeat).put("pendingPlay", playOnReady);
            if (includeList) {
                JSONArray items = new JSONArray();
                for (Track track : tracks) items.put(new JSONObject().put("id", track.id).put("name", track.title));
                state.put("tracks", items);
            }
            if (levels != null) {
                JSONArray bars = new JSONArray();
                for (int level : levels) bars.put(level);
                state.put("bars", bars);
            }
            return state;
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private void persist() {
        JSONArray saved = new JSONArray();
        try {
            for (Track track : tracks) {
                if (track.permission != 0) {
                    saved.put(new JSONObject().put("id", track.id).put("title", track.title)
                            .put("uri", track.uri.toString()).put("permission", track.permission));
                }
            }
            settings.edit().putString("playlist", saved.toString())
                    .putString("track", selected == null ? "" : selected.id)
                    .putInt("volume", volume).putString("repeat", repeat).apply();
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private void load() {
        volume = Math.max(0, Math.min(100, settings.getInt("volume", 75)));
        String mode = settings.getString("repeat", "off");
        if ("all".equals(mode) || "one".equals(mode)) repeat = mode;
        try {
            JSONArray saved = new JSONArray(settings.getString("playlist", "[]"));
            Set<Uri> allowed = new HashSet<>();
            for (UriPermission permission : resolver.getPersistedUriPermissions()) {
                if (permission.isReadPermission()) allowed.add(permission.getUri());
            }
            for (int index = 0; index < Math.min(MAX_TRACKS, saved.length()); index++) {
                JSONObject entry = saved.getJSONObject(index);
                Uri uri = Uri.parse(entry.getString("uri"));
                if (allowed.contains(uri) && valid(uri)) {
                    tracks.add(new Track(entry.getString("id"), uri, label(entry.getString("title")),
                            entry.optInt("permission") == 2 ? 2 : 1));
                }
            }
            selected = find(settings.getString("track", ""));
            if (selected != null) phase = "stopped";
        } catch (JSONException | RuntimeException ignored) {
            // Skip damaged playlist entries. The picker can still add tracks.
        }
    }

    private int persistPermission(Uri uri, int flags) {
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) return 0;
        try {
            for (UriPermission permission : resolver.getPersistedUriPermissions()) {
                if (permission.isReadPermission() && permission.getUri().equals(uri)) return 1;
            }
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return 2;
        } catch (SecurityException | IllegalArgumentException error) {
            return 0;
        }
    }

    private void releasePermission(Track track) {
        if (track.permission != 2) return;
        try {
            resolver.releasePersistableUriPermission(track.uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException | IllegalArgumentException ignored) {
            // A provider can revoke access before the track is removed.
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (RuntimeException ignored) { }
        return "Audio track";
    }

    static boolean supports(String mimeType, String name) {
        if (mimeType != null && mimeType.startsWith("audio/")) return true;
        return name.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(mp3|flac|ogg|opus|wav|m4a|aac|amr|mid|midi|aiff)$");
    }

    private static String label(String name) {
        String title = name == null ? "" : name.replaceAll("[\\p{Cntrl}]", " ").trim();
        return title.isEmpty() ? "Audio track" : LuaStudioRuntime.shorten(title, 140);
    }

    private static boolean valid(Uri uri) {
        return uri != null && ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())
                && uri.getAuthority() != null && uri.toString().length() < 4096;
    }

    private static final class Track {
        final String id;
        final Uri uri;
        final String title;
        int permission;

        Track(String id, Uri uri, String title, int permission) {
            this.id = id;
            this.uri = uri;
            this.title = title;
            this.permission = permission;
        }
    }
}
