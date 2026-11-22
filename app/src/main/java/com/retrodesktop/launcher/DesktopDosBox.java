package com.retrodesktop.launcher;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.Executor;

final class DesktopDosBox {
    private static final String HOST = "dosbox.retrodesktop.invalid";
    private static final String ORIGIN = "https://" + HOST;
    private static final int PICK_BUNDLE = 40;
    private static final long MAX_ARCHIVE = 64L * 1024 * 1024;
    private static final long MAX_UNPACKED = 96L * 1024 * 1024;
    private final DesktopActivity activity;
    private final FrameLayout frame;
    private final View desktop;
    private final Executor worker;
    private final Runnable interaction;
    private WebView player;
    private Session current;
    private int request;
    private boolean visible;
    private boolean fullScreen;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    DesktopDosBox(DesktopActivity activity, FrameLayout frame, View desktop, Executor worker, Runnable interaction) {
        this.activity = activity;
        this.frame = frame;
        this.desktop = desktop;
        this.worker = worker;
        this.interaction = interaction;
        frame.addOnLayoutChangeListener((view, l,t,r,b,ol,ot,or_,ob) -> {
            if (fullScreen && player != null && (r-l != or_-ol || b-t != ob-ot)) placeFullscreen();
        });
    }

    void command(String action, String value) {
        switch (action) {
            case "demo":
                request++;
                start(new Session("DOSBox Demo", null, ""));
                break;
            case "choose":
                activity.pickForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*"), PICK_BUNDLE, "No Android file picker is available.");
                break;
            case "workspace":
                prepare(null, value, "", false);
                break;
            case "fullscreen":
                setFullscreen(true);
                break;
            case "close":
                close();
                break;
        }
    }

    boolean onResult(int code, int result, Intent data) {
        if (code != PICK_BUNDLE) return false;
        if (result == Activity.RESULT_OK && data != null && data.getData() != null) prepare(data.getData(), "", "", true);
        return true;
    }

    void open(Uri uri, String name) { activity.runOnUiThread(() -> {
        if (activity.isDesktopReady()) prepare(uri, "", name, false);
    }); }

    private void prepare(Uri uri, String key, String title, boolean keep) {
        int generation = ++request;
        report("Importing DOS package…");
        worker.execute(() -> {
            File stage = null;
            try {
                File workspace = DesktopWorkspace.root(activity).getCanonicalFile();
                File local = uri == null ? DesktopFileCatalog.resolve(workspace, key) : null;
                String name = local != null ? local.getName() : title.isEmpty() ? displayName(uri) : title;
                if (!isPackage(name)) throw new IOException("Choose a ZIP, DOSZ, or JSDOS game package.");
                stage = File.createTempFile("dosbox-", ".zip", activity.getCacheDir());
                try (InputStream input = local == null ? activity.getContentResolver().openInputStream(uri)
                        : Files.newInputStream(local.toPath()); OutputStream output = Files.newOutputStream(stage.toPath())) {
                    if (input == null) throw new IOException("Could not read this game package.");
                    ZipContents.copy(input, output, MAX_ARCHIVE);
                }
                String command = checkBundle(stage);
                String shown = keep ? DesktopWorkspace.store(DesktopWorkspace.folder(activity, DesktopWorkspace.DOS_GAMES),
                        stage, DesktopDocuments.name(name)).getName() : name;
                if (keep) activity.refreshFileListing();
                File ready = stage;
                stage = null;
                activity.runOnUiThread(() -> {
                    if (generation == request && activity.isDesktopReady()) start(new Session(shown, ready, command));
                    else ready.delete();
                });
            } catch (Exception error) {
                activity.runOnUiThread(() -> {
                    if (generation == request) report(DesktopArchives.detail(error,
                            "Could not open this DOS package. Choose a valid ZIP under 64 MB."));
                });
            } finally { if (stage != null) stage.delete(); }
        });
    }

    static boolean isPackage(String name) { return name.matches("(?is).+\\.(zip|dosz|jsdos)"); }

    static String checkBundle(File archive) throws IOException {
        try (ZipContents contents = new ZipContents(archive)) {
            if (contents.root.children.isEmpty()) throw new IOException("This DOS package is empty.");
            long bytes = 0;
            java.util.Enumeration<? extends java.util.zip.ZipEntry> entries = contents.file.entries();
            while (entries.hasMoreElements()) {
                long size = entries.nextElement().getSize();
                bytes += Math.max(0, size);
                if (bytes > MAX_UNPACKED) throw new IOException("This DOS package exceeds 96 MB when extracted.");
            }
            for (String boot : new String[]{"dosbox.bat", "start.bat", "play.bat"}) {
                ZipContents.Item item = contents.root.children.get(boot);
                if (item != null && !item.directory()) return boot.toUpperCase(java.util.Locale.ROOT);
            }
            return "";
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME},
                null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) return cursor.getString(0);
        } catch (RuntimeException ignored) { }
        return "DOS Game.zip";
    }

    private void start(Session session) {
        disposePlayer();
        current = session;
        WebView web = new WebView(activity);
        player = web;
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setSupportMultipleWindows(false);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.setBackgroundColor(0xff000000);
        web.setVisibility(View.GONE);
        web.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) interaction.run();
            return false;
        });
        web.addJavascriptInterface(new Events(session), "RetroDosBox");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return response(session, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (player == view) {
                    view.evaluateJavascript("window.dosboxVisible?.(" + visible + ")", null);
                    view.evaluateJavascript("window.dosboxFullscreenState?.(" + fullScreen + ")", null);
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (player == view) {
                    close();
                    report("DOSBox stopped. Open the game again to restart it.");
                }
                return true;
            }
        });
        frame.addView(web, new FrameLayout.LayoutParams(0, 0, Gravity.TOP | Gravity.LEFT));
        try {
            activity.sendObject("dosBoxStarted", new JSONObject().put("title", session.title));
        } catch (JSONException ignored) { }
        String query = session.file == null ? "" : "?archive=" + session.token + "&start=" + Uri.encode(session.command);
        web.loadUrl(ORIGIN + "/player.html" + query);
    }

    private WebResourceResponse response(Session session, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())
                || uri.getPort() != -1) return denied();
        String path = uri.getPath();
        try {
            if (path != null && path.equals("/game/" + session.token) && session.file != null) {
                return new WebResourceResponse("application/zip", null, 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), Files.newInputStream(session.file.toPath()));
            }
            if (path == null || !path.matches("/(?:player\\.(html|css|js)|player-deluxe\\.js|deluxe-profile\\.js|engine/(emulators\\.js|wdosbox\\.(js|wasm)|wlibzip\\.(js|wasm)|COPYING))")) return denied();
            String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" :
                    path.endsWith(".js") ? "application/javascript" : path.endsWith(".wasm") ? "application/wasm" : "text/plain";
            return new WebResourceResponse(mime, path.endsWith(".wasm") ? null : "UTF-8",
                    activity.getAssets().open("dosbox" + path));
        } catch (IOException error) { return denied(); }
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }

    void place(int left, int top, int width, int height) {
        if (player == null) return;
        boolean showing = fullScreen ? placeFullscreen() : DesktopBrowser.placeOverlay(desktop, player, left, top, width, height);
        if (showing != visible) {
            visible = showing;
            player.evaluateJavascript("window.dosboxVisible?.(" + visible + ")", null);
        }
    }

    private boolean placeFullscreen() {
        if (player == null) return false;
        return DesktopBrowser.placeOverlay(desktop, player, 0, 0, desktop.getWidth(), desktop.getHeight());
    }

    void setFullscreen(boolean enabled) {
        if (player == null || fullScreen == enabled) return;
        fullScreen = enabled;
        if (enabled) {
            previousOrientation = activity.getRequestedOrientation();
            applyWindowBars(true);
            place(0, 0, 0, 0);
        } else {
            resetOrientation();
            applyWindowBars(false);
            DesktopBrowser.placeOverlay(desktop, player, 0, 0, 0, 0);
            visible = false;
            player.evaluateJavascript("window.dosboxVisible?.(false)", null);
            activity.requestDosPlacement();
        }
        player.evaluateJavascript("window.dosboxFullscreenState?.(" + enabled + ")", null);
    }

    boolean exitFullscreen() {
        if (!fullScreen) return false;
        setFullscreen(false);
        return true;
    }

    void orientation(String mode) {
        if (!fullScreen) return;
        int value = "landscape".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE :
                "portrait".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT :
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        activity.setRequestedOrientation(value);
    }

    private void resetOrientation() {
        activity.setRequestedOrientation(previousOrientation);
        previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    }

    private void applyWindowBars(boolean immersive) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = activity.getWindow().getInsetsController();
            if (controller != null) {
                if (immersive) controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                else {controller.show(WindowInsets.Type.navigationBars()); controller.hide(WindowInsets.Type.statusBars());}
            }
        } else {
            activity.getWindow().getDecorView().setSystemUiVisibility(
                    immersive ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY :
                      View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    void suspend() {
        if (player == null) return;
        DesktopBrowser.placeOverlay(desktop, player, 0, 0, 0, 0);
        visible = false;
        player.evaluateJavascript("window.dosboxVisible?.(false)", null);
    }

    void close() {
        request++;
        disposePlayer();
    }

    private void disposePlayer() {
        if (fullScreen) {
            fullScreen = false;
            resetOrientation();
            applyWindowBars(false);
        }
        if (player != null) {
            frame.removeView(player);
            player.removeJavascriptInterface("RetroDosBox");
            player.stopLoading();
            player.destroy();
            player = null;
        }
        if (current != null && current.file != null) current.file.delete();
        current = null;
        visible = false;
    }

    private void report(String message) {
        try { activity.sendObject("dosBoxStatus", new JSONObject().put("message", message)); }
        catch (JSONException ignored) { }
    }

    private final class Events {
        private final Session session;
        Events(Session session) { this.session = session; }

        @JavascriptInterface
        public void fullscreen(boolean enabled) {
            activity.runOnUiThread(() -> { if (session == current) setFullscreen(enabled); });
        }

        @JavascriptInterface
        public void orientation(String mode) {
            if (!"auto".equals(mode) && !"landscape".equals(mode) && !"portrait".equals(mode)) return;
            activity.runOnUiThread(() -> { if (session == current) DesktopDosBox.this.orientation(mode); });
        }

        @JavascriptInterface
        public void status(String message) {
            if (message == null || message.length() > 180) return;
            activity.runOnUiThread(() -> {
                if (session == current) report(message);
            });
        }
    }

    private static final class Session {
        final String token = UUID.randomUUID().toString();
        final String title;
        final File file;
        final String command;

        Session(String title, File file, String command) {
            this.title = DesktopDocuments.name(title);
            this.file = file;
            this.command = command;
        }
    }
}
