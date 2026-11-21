package com.retrodesktop.launcher;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Insets;
import android.graphics.drawable.Drawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.text.format.Formatter;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.text.Collator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public class DesktopActivity extends Activity {
    private static final String TAG = "RetroDesktop98";
    private static final String PAGE = "file:///android_asset/index.html";
    private static final int PICK_DOCUMENT = 10;
    private static final int PICK_HOME = 11;
    private static final int PICK_FOLDER = 12;
    private static final int PICK_WALLPAPER = 13;
    private static final int PICK_CLIPPY_MODEL = 14;
    private static final int PICK_AUDIO = 15;
    private static final int RECORD_PERMISSION = 16;
    private static final int PICK_AUDIO_LIMIT = 80;
    private static final int SILVER = 0xffc0c0c0;

    private final ExecutorService appLoader = Executors.newSingleThreadExecutor();
    private final ExecutorService storageWorker = Executors.newSingleThreadExecutor();
    private Map<String, ComponentName> appComponents = new HashMap<>();
    private SharedPreferences preferences;
    private WebView desktop;
    private String displayedWallpaper;
    private DesktopWallpaper wallpaper;
    private DesktopFiles files;
    private DesktopDocuments documents;
    private DesktopLuaStudio luaStudio;
    private DesktopAudio audio;
    private DesktopRecorder recorder;
    private DesktopTerminal terminal;
    private boolean recordingPermissionPending;
    private boolean recordAfterPermission;
    private LuaProgramStore luaPrograms;
    private boolean audioAttached;
    private boolean activityStarted;
    private final Consumer<JSONObject> audioEvents = event -> runOnUiThread(() -> {
        if (audioAttached) sendObject("retroAudioEvent", event);
    });
    private boolean desktopVisible;
    private DesktopBrowser browser;
    private DesktopDosBox dosBox;
    private DesktopDosStore dosStore;
    private DesktopMail mail;
    private ClippyAssistant clippy;
    private final Consumer<JSONObject> clippyEvents = event -> sendObject("clippyEvent", event);
    private boolean pageReady;
    private int appGeneration;

    private final BroadcastReceiver packageChanges = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshApps();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::desktopBack);
        }
        preferences = getSharedPreferences("desktop", MODE_PRIVATE);
        audio = DesktopAudio.get(this);
        luaPrograms = new LuaProgramStore(this);
        clippy = ClippyAssistant.get(this);
        desktop = new WebView(this);
        desktop.setBackgroundColor(0xff008080);
        desktop.getSettings().setJavaScriptEnabled(true);
        desktop.getSettings().setAllowFileAccess(false);
        desktop.getSettings().setAllowContentAccess(false);
        desktop.getSettings().setBlockNetworkLoads(true);
        desktop.getSettings().setSupportMultipleWindows(false);
        desktop.addJavascriptInterface(new DesktopBridge(), "AndroidDesktop");
        desktop.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().equals(PAGE);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request.getUrl().toString().startsWith("file:///android_asset/")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!PAGE.equals(url)) return;
                pageReady = true;
                attachAudio();
                clippy.attach(clippyEvents);
                evaluate("window.setDesktopVisible(" + desktopVisible + ")");
                syncLauncherStatus();
                refreshWallpaper();
                refreshApps();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                pageReady = false;
                recreate();
                return true;
            }
        });

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(SILVER);
        frame.addView(desktop, new FrameLayout.LayoutParams(-1, -1));
        wallpaper = new DesktopWallpaper(getContentResolver(), getFilesDir());
        luaStudio = new DesktopLuaStudio(this);
        documents = new DesktopDocuments(this, preferences, wallpaper, storageWorker, savedInstanceState);
        recorder = new DesktopRecorder(this, documents);
        terminal = new DesktopTerminal(update -> runOnUiThread(() -> sendObject("hyperTerminalEvent", update)));
        browser = new DesktopBrowser(frame, desktop, this::browserState,
                documents::offerDownload, () -> evaluate("window.desktopInteraction()"));
        dosBox = new DesktopDosBox(this, frame, desktop, storageWorker, () -> evaluate("window.desktopInteraction()"));
        dosStore = new DesktopDosStore(this, preferences);
        mail = new DesktopMail(this, this::submitAttachment);
        files = new DesktopFiles(this, preferences, documents, storageWorker);
        setContentView(frame);
        configureSystemBars(frame);

        IntentFilter packages = new IntentFilter();
        packages.addAction(Intent.ACTION_PACKAGE_ADDED);
        packages.addAction(Intent.ACTION_PACKAGE_REMOVED);
        packages.addAction(Intent.ACTION_PACKAGE_CHANGED);
        packages.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(packageChanges, packages, Context.RECEIVER_EXPORTED);
        else registerReceiver(packageChanges, packages);
        desktop.loadUrl(PAGE);
    }

    @SuppressWarnings("deprecation")
    private void configureSystemBars(FrameLayout frame) {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().setNavigationBarContrastEnforced(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.navigationBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                frame.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return insets;
            });
            frame.requestApplyInsets();
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        activityStarted = true;
        attachAudio();
    }

    @Override
    protected void onStop() {
        activityStarted = false;
        detachAudio();
        terminal.disconnect("Disconnected when the launcher went to the background.");
        super.onStop();
    }

    private void attachAudio() {
        if (activityStarted && pageReady && !audioAttached) {
            audioAttached = true;
            audio.attach(audioEvents);
        }
    }

    private void detachAudio() {
        if (audioAttached) {
            audioAttached = false;
            audio.detach(audioEvents);
        }
    }

    boolean canPreviewRecording() {
        return desktopVisible && pageReady;
    }

    private void requestRecording() {
        if (!canPreviewRecording()) return;
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            audio.command("pause", "");
            recorder.start();
        } else if (!recordingPermissionPending) {
            recordingPermissionPending = true;
            recorder.permissionPrompt();
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, RECORD_PERMISSION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request != RECORD_PERMISSION || !recordingPermissionPending) return;
        recordingPermissionPending = false;
        if (!pageReady) return;
        if (grants.length == 0 || grants[0] != PackageManager.PERMISSION_GRANTED) {
            recorder.error("Allow Sound Recorder to use the microphone, then try recording again.");
            return;
        }
        if (desktopVisible) requestRecording();
        else recordAfterPermission = true;
    }

    void openAudioDocument(Uri uri, String name) {
        runOnUiThread(() -> {
            if (!pageReady) return;
            evaluate("window.openRetroAudio()");
            audio.add(java.util.Collections.singletonList(uri), 0, true, name);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        desktopVisible = true;
        if (recordAfterPermission) {
            recordAfterPermission = false;
            requestRecording();
        }
        evaluate("window.setDesktopVisible(true)");
        syncLauncherStatus();
        if (pageReady) {
            clippy.attach(clippyEvents);
            refreshWallpaper();
            evaluate("window.refreshDesktopApps()");
        }
    }

    @Override
    protected void onPause() {
        desktopVisible = false;
        dosBox.suspend();
        recorder.suspend();
        evaluate("window.setDesktopVisible(false)");
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        documents.saveInstanceState(state);
        super.onSaveInstanceState(state);
    }

    private void submitAttachment(DesktopMail.Attachment attachment) {
        runOnUiThread(() -> {
            if (!pageReady) attachment.file.delete();
            else storageWorker.execute(() -> documents.openAttachment(
                    attachment.name, attachment.mime, attachment.file, attachment.save));
        });
    }

    void openDosPackage(Uri uri, String name) { dosBox.open(uri, name); }

    void dosStoreMoved(String from, String to) { dosStore.moved(from, to); }

    boolean isDesktopReady() {
        return pageReady;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.hasCategory(Intent.CATEGORY_HOME)) evaluate("window.desktopHome()");
    }

    @Override
    public void onBackPressed() {
        desktopBack();
    }

    private void desktopBack() {
        if (!pageReady) return;
        desktop.evaluateJavascript("window.desktopBack()", value -> {
            if ("false".equals(value) && (isPreview() || !isDefaultHome())) finish();
        });
    }

    private boolean isPreview() {
        return this instanceof PreviewActivity;
    }

    private boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo current = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return current != null && getPackageName().equals(current.activityInfo.packageName)
                && DesktopActivity.class.getName().equals(current.activityInfo.name);
    }

    private void syncLauncherStatus() {
        if (pageReady) evaluate("window.updateLauncherStatus(" + isDefaultHome() + ", " + isPreview() + ")");
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(packageChanges);
        pageReady = false;
        detachAudio();
        recorder.close();
        terminal.close();
        clippy.detach(clippyEvents);
        luaStudio.close();
        appLoader.shutdownNow();
        documents.close();
        storageWorker.shutdown();
        browser.close();
        dosBox.close();
        dosStore.close();
        desktop.removeJavascriptInterface("AndroidDesktop");
        ((android.view.ViewGroup) desktop.getParent()).removeView(desktop);
        desktop.destroy();
        super.onDestroy();
    }

    private void evaluate(String script) {
        if (pageReady) desktop.evaluateJavascript(script, null);
    }

    void sendObject(String callback, JSONObject object) {
        String json = object.toString();
        if (json.length() <= 48_000) {
            evaluate("window." + callback + "(JSON.parse(" + quotedString(json) + "))");
        } else {
            sendChunks(json, "window." + callback + "(JSON.parse(", "))");
        }
    }

    private void browserState(String address, String status, boolean canGoBack, boolean canGoForward) {
        JSONObject object = new JSONObject();
        try {
            object.put("address", address).put("status", status)
                    .put("back", canGoBack).put("forward", canGoForward);
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        sendObject("browserPageState", object);
    }

    private void refreshWallpaper() {
        storageWorker.execute(() -> {
            String encoded = wallpaper.readEncoded();
            runOnUiThread(() -> showWallpaper(encoded));
        });
    }

    void showWallpaper(String encoded) {
        if (!pageReady || Objects.equals(displayedWallpaper, encoded)) return;
        displayedWallpaper = encoded;
        if (encoded == null) {
            evaluate("window.setWallpaperStatus(false)");
            return;
        }
        sendChunks(encoded, "window.setWallpaperStatus(true, ", ")");
    }

    void showSelectedWallpaper(String encoded) {
        showWallpaper(encoded);
        evaluate("window.useCustomWallpaper()");
    }

    void sendDesktopImage(String filename, String encoded) {
        sendChunks(encoded, "window.desktopPicture(" + quotedString(filename) + ", ", ")");
    }

    private void sendChunks(String value, String prefix, String suffix) {
        if (!pageReady) return;
        // Keep large payloads below WebView's per-call transport limits.
        int chunkSize = 48_000;
        evaluate("window.desktopChunks = []");
        for (int offset = 0; offset < value.length();) {
            int end = Math.min(offset + chunkSize, value.length());
            if (end < value.length() && Character.isHighSurrogate(value.charAt(end - 1))) end--;
            evaluate("window.desktopChunks.push(" + quotedString(value.substring(offset, end)) + ")");
            offset = end;
        }
        evaluate(prefix + "window.desktopChunks.join('')" + suffix + "; delete window.desktopChunks");
    }

    private void wallpaperCommand(String command) {
        if ("choose".equals(command)) {
            pickForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*"), PICK_WALLPAPER, "No image picker is available.");
        } else if ("remove".equals(command)) {
            storageWorker.execute(() -> {
                wallpaper.remove();
                runOnUiThread(() -> showWallpaper(null));
            });
        }
    }

    private void refreshApps() {
        if (!pageReady) return;
        int generation = ++appGeneration;
        appLoader.execute(() -> {
            PackageManager manager = getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> results = manager.queryIntentActivities(launcher, 0);
            Collator collator = Collator.getInstance();
            results.sort((a, b) -> collator.compare(a.loadLabel(manager).toString(), b.loadLabel(manager).toString()));
            List<String> batches = new ArrayList<>();
            JSONArray apps = new JSONArray();
            Map<String, ComponentName> components = new HashMap<>();
            for (ResolveInfo result : results) {
                if (Thread.currentThread().isInterrupted()) return;
                if (getPackageName().equals(result.activityInfo.packageName)) continue;
                ComponentName component = new ComponentName(result.activityInfo.packageName, result.activityInfo.name);
                String id = component.flattenToString();
                if (components.containsKey(id)) continue;
                try {
                    JSONObject info = new JSONObject();
                    info.put("id", id);
                    info.put("name", result.loadLabel(manager).toString());
                    try {
                        info.put("icon", drawableData(result.loadIcon(manager)));
                    } catch (RuntimeException error) {
                        Log.d(TAG, "App icon unavailable", error);
                    }
                    components.put(id, component);
                    apps.put(info);
                    if (apps.length() == 24) {
                        batches.add(quotedJson(apps));
                        apps = new JSONArray();
                    }
                } catch (JSONException | RuntimeException error) {
                    Log.w(TAG, "Skipping unavailable launcher activity", error);
                }
            }
            if (apps.length() != 0) batches.add(quotedJson(apps));
            runOnUiThread(() -> {
                if (!pageReady || generation != appGeneration) return;
                appComponents = components;
                evaluate("window.desktopAppBatch = []");
                for (String json : batches) evaluate("window.desktopAppBatch.push(...JSON.parse(" + json + "))");
                evaluate("window.setInstalledApps(window.desktopAppBatch); delete window.desktopAppBatch;");
            });
        });
    }

    private static String quotedJson(JSONArray apps) {
        return quotedString(apps.toString());
    }

    private static String quotedString(String value) {
        return JSONObject.quote(value).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    }

    private static String drawableData(Drawable drawable) {
        Bitmap bitmap = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
        drawable.setBounds(0, 0, 48, 48);
        drawable.draw(new Canvas(bitmap));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes);
        bitmap.recycle();
        return "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
    }

    boolean tryStart(Intent intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (ActivityNotFoundException | SecurityException error) {
            Log.d(TAG, "No route for " + intent.getAction(), error);
            return false;
        }
    }

    private void settings(String action) {
        if (!tryStart(new Intent(action))
                && (Settings.ACTION_SETTINGS.equals(action) || !tryStart(new Intent(Settings.ACTION_SETTINGS)))) {
            message("Android Settings is unavailable on this device.");
        }
    }

    private void selectHome() {
        if (tryStart(new Intent(Settings.ACTION_HOME_SETTINGS))) return;
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager roles = getSystemService(RoleManager.class);
            if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) && !roles.isRoleHeld(RoleManager.ROLE_HOME)) {
                try {
                    startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), PICK_HOME);
                    return;
                } catch (ActivityNotFoundException | SecurityException error) {
                    Log.d(TAG, "Home role picker unavailable", error);
                }
            }
        }
        settings(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
    }

    private void openBrowser() {
        if (!tryStart(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER))) {
            openWeb("https://www.google.com/");
        }
    }

    private void openWeb(String address) {
        Uri uri = Uri.parse(address).normalizeScheme();
        if ((!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getHost().isEmpty()) {
            message("Enter an HTTP or HTTPS address.");
            return;
        }
        if (!tryStart(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))) {
            message("No web browser is available.");
        }
    }

    void refreshFileListing() {
        runOnUiThread(() -> {
            if (pageReady) evaluate("window.refreshFileListing()");
        });
    }

    private void openFiles() {
        if (!tryStart(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_FILES))) pickDocument();
    }

    private void pickDocument() {
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        pickForResult(pick, PICK_DOCUMENT, "No Android file picker is available.");
    }

    boolean pickForResult(Intent intent, int requestCode, String failure) {
        try {
            startActivityForResult(intent, requestCode);
            return true;
        } catch (ActivityNotFoundException | SecurityException error) {
            message(failure);
            return false;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (dosBox.onResult(request, result, data)) return;
        if (documents.onResult(request, result, data)) return;
        if (request == PICK_AUDIO) {
            if (result == RESULT_OK && data != null) {
                List<Uri> addresses = new ArrayList<>();
                android.content.ClipData clips = data.getClipData();
                if (clips != null) {
                    for (int index = 0; index < Math.min(clips.getItemCount(), PICK_AUDIO_LIMIT + 1); index++) {
                        addresses.add(clips.getItemAt(index).getUri());
                    }
                } else if (data.getData() != null) addresses.add(data.getData());
                audio.add(addresses, data.getFlags(), false, "");
            }
            return;
        }
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK_CLIPPY_MODEL) {
            clippy.importModel(uri);
            return;
        }
        if (request == PICK_FOLDER) {
            files.selectRoot(uri, data.getFlags());
            return;
        }
        if (request == PICK_WALLPAPER) {
            storageWorker.execute(() -> {
                try {
                    wallpaper.save(uri);
                    String encoded = wallpaper.readEncoded();
                    runOnUiThread(() -> showSelectedWallpaper(encoded));
                } catch (IOException | RuntimeException error) {
                    runOnUiThread(() -> message("Could not set this image as the wallpaper."));
                }
            });
            return;
        }
        if (request == PICK_DOCUMENT) documents.open(uri, "");
    }

    private void openCalendar() {
        Uri day = CalendarContract.CONTENT_URI.buildUpon().appendPath("time")
                .appendPath(Long.toString(System.currentTimeMillis())).build();
        if (!tryStart(new Intent(Intent.ACTION_VIEW, day))
                && !tryStart(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR))) {
            settings(Settings.ACTION_DATE_SETTINGS);
        }
    }

    void message(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    private void openSystem(String action, String argument) {
        switch (action) {
            case "settings": settings(Settings.ACTION_SETTINGS); break;
            case "wifi": settings(Settings.ACTION_WIFI_SETTINGS); break;
            case "bluetooth": settings(Settings.ACTION_BLUETOOTH_SETTINGS); break;
            case "display": settings(Settings.ACTION_DISPLAY_SETTINGS); break;
            case "battery": settings(Settings.ACTION_BATTERY_SAVER_SETTINGS); break;
            case "apps": settings(Settings.ACTION_APPLICATION_SETTINGS); break;
            case "storage": settings(Settings.ACTION_INTERNAL_STORAGE_SETTINGS); break;
            case "about": settings(Settings.ACTION_DEVICE_INFO_SETTINGS); break;
            case "date": settings(Settings.ACTION_DATE_SETTINGS); break;
            case "home": selectHome(); break;
            case "files": openFiles(); break;
            case "document": pickDocument(); break;
            case "browser": openBrowser(); break;
            case "url": openWeb(argument); break;
            case "calendar": openCalendar(); break;
            case "network":
                if (Build.VERSION.SDK_INT < 29 || !tryStart(new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY))) {
                    settings(Settings.ACTION_WIRELESS_SETTINGS);
                }
                break;
        }
    }

    private final class DesktopBridge {
        @JavascriptInterface
        public String desktopTrayStatus() {
            try {
                JSONObject info = new JSONObject();
                Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (battery != null && battery.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)) {
                    int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 0);
                    int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN);
                    int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                    if (level >= 0 && scale > 0) info.put("battery", Math.round(100f * level / scale));
                    info.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING)
                            .put("plugged", plugged != 0);
                }
                AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (audio != null) {
                    int stream = AudioManager.STREAM_MUSIC;
                    return info.put("volume", audio.getStreamVolume(stream))
                            .put("max", audio.getStreamMaxVolume(stream))
                            .put("min", Build.VERSION.SDK_INT >= 28 ? audio.getStreamMinVolume(stream) : 0)
                            .put("fixed", audio.isVolumeFixed()).toString();
                }
                return info.toString();
            } catch (JSONException | RuntimeException error) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void setDesktopVolume(int volume) {
            runOnUiThread(() -> {
                AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (!pageReady || audio == null || audio.isVolumeFixed()) return;
                int stream = AudioManager.STREAM_MUSIC;
                int minimum = Build.VERSION.SDK_INT >= 28 ? audio.getStreamMinVolume(stream) : 0;
                int maximum = audio.getStreamMaxVolume(stream);
                try { audio.setStreamVolume(stream, Math.max(minimum, Math.min(maximum, volume)), 0); }
                catch (RuntimeException error) { message("Android could not change the media volume."); }
            });
        }

        @JavascriptInterface
        public String loadState() {
            return preferences.getString("layout", "");
        }

        @JavascriptInterface
        public void saveState(String state) {
            if (state != null && state.length() < 2_000_000) preferences.edit().putString("layout", state).apply();
        }

        @JavascriptInterface
        public void launchApp(String id) {
            runOnUiThread(() -> {
                ComponentName component = appComponents.get(id);
                if (component == null || !tryStart(Intent.makeMainActivity(component))) {
                    message("This app is currently unavailable.");
                    refreshApps();
                }
            });
        }

        @JavascriptInterface
        public void appInfo(String id) {
            runOnUiThread(() -> {
                ComponentName component = appComponents.get(id);
                if (component == null) {
                    message("This app is currently unavailable.");
                    return;
                }
                Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", component.getPackageName(), null));
                if (!tryStart(details)) settings(Settings.ACTION_APPLICATION_SETTINGS);
            });
        }

        @JavascriptInterface
        public void system(String action, String argument) {
            if (action != null) runOnUiThread(() -> openSystem(action, argument == null ? "" : argument));
        }

        @JavascriptInterface
        public void browserCommand(String command, String address) {
            if (command == null) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                if ("go".equals(command) && address != null) browser.navigate(address);
                else browser.command(command);
            });
        }

        @JavascriptInterface
        public void mailCommand(String command, String request, String data) {
            if (command == null || request == null || data == null || request.length() > 50 ||
                    command.length() > 8 || data.length() > 262_144) return;
            runOnUiThread(() -> {
                if (pageReady) mail.command(command, request, data,
                        result -> runOnUiThread(() -> sendObject("mailEvent", result)));
            });
        }

        @JavascriptInterface
        public void clippyCommand(String command, String argument) {
            if (command == null) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                clippy.attach(clippyEvents);
                switch (command) {
                    case "status": break;
                    case "ask": if (argument != null) clippy.ask(argument); break;
                    case "download": clippy.download(); break;
                    case "clear": clippy.clearHistory(); break;
                    case "remove": clippy.remove(); break;
                    case "import":
                        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                                .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                        pickForResult(pick, PICK_CLIPPY_MODEL, "No model file picker is available.");
                        break;
                }
            });
        }

        @JavascriptInterface
        public void clippyMail(String request, String action, String subject, String body) {
            if (request == null || action == null || subject == null || body == null ||
                    request.isEmpty() || request.length() > 60 || action.length() > 8 || subject.length() > 300 || body.length() > 1600) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                clippy.attach(clippyEvents);
                clippy.assistMail(request, action, subject, body, clippyEvents);
            });
        }

        @JavascriptInterface
        public void browserPlace(int left, int top, int width, int height) {
            runOnUiThread(() -> {
                if (pageReady) browser.place(left, top, width, height);
            });
        }

        @JavascriptInterface
        public void dosBoxCommand(String action, String value) {
            if (action == null || value == null || action.length() > 16 || value.length() > 4096) return;
            runOnUiThread(() -> { if (pageReady) dosBox.command(action, value); });
        }

        @JavascriptInterface
        public void dosStoreCommand(String action, String id) {
            if (action == null || id == null || id.length() > 80) return;
            runOnUiThread(() -> { if (pageReady) dosStore.command(action, id); });
        }

        @JavascriptInterface
        public void dosBoxPlace(int left, int top, int width, int height) {
            runOnUiThread(() -> {
                if (!pageReady || !desktopVisible) dosBox.suspend();
                else dosBox.place(left, top, width, height);
            });
        }

        @JavascriptInterface
        public void fileCommand(String command, String id) {
            if (command == null || command.length() > 24 || (id != null && id.length() > 60_000)) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                if ("choose".equals(command) || ("android".equals(command) && DesktopWorkspace.tree(preferences) == null)) {
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    pickForResult(pick, PICK_FOLDER, "No Android folder picker is available.");
                } else files.command(command, id == null ? "" : id);
            });
        }

        @JavascriptInterface
        public void wallpaperCommand(String command) {
            runOnUiThread(() -> {
                if (pageReady) DesktopActivity.this.wallpaperCommand(command);
            });
        }

        @JavascriptInterface
        public boolean isLandscape() {
            return getResources().getConfiguration().orientation ==
                    android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        }

        @JavascriptInterface
        public void keepDesktopAwake(boolean keepAwake) {
            runOnUiThread(() -> {
                if (keepAwake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void desktopFile(String action, String id, String data) {
            if (action == null || id == null || data == null || action.length() > 30 || id.length() > 55) return;
            runOnUiThread(() -> {
                if (pageReady) documents.command(action, id, data);
            });
        }

        @JavascriptInterface
        public void terminalCommand(String action, String id, String data) {
            if (action == null || id == null || data == null || action.length() > 12 ||
                    id.length() > 45 || data.length() > 16_384) return;
            runOnUiThread(() -> {
                if (pageReady && activityStarted) terminal.command(action, id, data);
            });
        }

        @JavascriptInterface
        public String loadTerminalDirectory() {
            return preferences.getString("terminalDirectory", "[]");
        }

        @JavascriptInterface
        public void saveTerminalDirectory(String directory) {
            if (directory != null && directory.length() <= 24_000) {
                preferences.edit().putString("terminalDirectory", directory).apply();
            }
        }

        @JavascriptInterface
        public void copyDesktopText(String text) {
            if (text == null || text.isEmpty() || text.length() > 120_000) return;
            runOnUiThread(() -> {
                if (!pageReady || !desktopVisible) return;
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Retro Desktop 98", text));
            });
        }

        @JavascriptInterface
        public String loadWordDraft() {
            return preferences.getString("wordpad-draft", "");
        }

        @JavascriptInterface
        public void saveWordDraft(String draft) {
            if (draft != null && draft.length() <= 1_560_000) preferences.edit().putString("wordpad-draft", draft).apply();
        }

        @JavascriptInterface
        public void recorderCommand(String action, String options) {
            if (action == null || options == null || action.length() > 16 || options.length() > 300) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                if ("record".equals(action)) requestRecording();
                else {
                    if ("stop".equals(action)) recordAfterPermission = false;
                    recorder.command(action, options);
                }
            });
        }

        @JavascriptInterface
        public void audioCommand(String action, String value) {
            if (action == null || value == null || action.length() > 20 || value.length() > 80) return;
            runOnUiThread(() -> {
                if (!pageReady) return;
                if ("choose".equals(action)) {
                    Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*")
                            .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    pickForResult(picker, PICK_AUDIO, "No Android audio picker is available.");
                } else if ("meter".equals(action)) audio.meter(audioEvents, "on".equals(value));
                else audio.command(action, value);
            });
        }

        @JavascriptInterface
        public String listLuaPrograms() {
            return luaPrograms.list();
        }

        @JavascriptInterface
        public String readLuaProgram(String id) {
            return luaPrograms.read(id);
        }

        @JavascriptInterface
        public String publishLuaProgram(String id, String data) {
            return luaPrograms.publish(id, data);
        }

        @JavascriptInterface
        public boolean removeLuaProgram(String id) {
            return luaPrograms.remove(id);
        }

        @JavascriptInterface
        public String loadLuaWorkspaceProgram() {
            return preferences.getString("lua-workspace-program", "");
        }

        @JavascriptInterface
        public void saveLuaWorkspace(String data, String id) {
            if (data == null || data.length() > LuaStudioRuntime.MAX_PAYLOAD || id == null ||
                    (!id.isEmpty() && !LuaProgramStore.valid(id))) return;
            preferences.edit().putString("lua-project", data).putString("lua-workspace-program", id).apply();
        }

        // Lua file operations are capped, scoped and validated on the native side.
        @JavascriptInterface
        public String luaWorkspaceFile(String action, String program, String name, String text) {
            return LuaProjectFiles.operate(DesktopActivity.this, program,
                    action == null ? "" : action, name, text).toString();
        }

        // SQLite calls use a per-program database, never the launcher's database.
        @JavascriptInterface
        public String luaDatabase(String session, String program, String action, String sql, String parameters) {
            return LuaProjectDatabase.operate(DesktopActivity.this, session, program, action, sql, parameters).toString();
        }

        @JavascriptInterface
        public void luaDatabaseClose(String session) {
            LuaProjectDatabase.closeSession(session);
        }

        @JavascriptInterface
        public String loadLuaProject() {
            return preferences.getString("lua-project", "");
        }

        @JavascriptInterface
        public void saveLuaProject(String data) {
            if (data != null && data.length() <= LuaStudioRuntime.MAX_PAYLOAD) {
                preferences.edit().putString("lua-project", data).apply();
            }
        }

        @JavascriptInterface
        public void luaCommand(String action, String session, String data) {
            if (action == null || session == null || data == null || session.isEmpty() || session.length() > 60 ||
                    data.length() > LuaStudioRuntime.MAX_PAYLOAD) return;
            runOnUiThread(() -> {
                if (pageReady) luaStudio.command(action, session, data);
            });
        }

        @JavascriptInterface
        public String loadNote() {
            return preferences.getString("note", "");
        }

        @JavascriptInterface
        public void saveNote(String note) {
            if (note != null && note.length() <= 150_000) preferences.edit().putString("note", note).apply();
        }

        @JavascriptInterface
        public String availableStorage() {
            try {
                StatFs space = new StatFs(Environment.getDataDirectory().getPath());
                return Formatter.formatFileSize(DesktopActivity.this, space.getAvailableBytes()) + " free";
            } catch (IllegalArgumentException error) {
                return "Internal shared storage";
            }
        }
    }
}
