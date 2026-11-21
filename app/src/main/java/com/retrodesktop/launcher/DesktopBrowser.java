package com.retrodesktop.launcher;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.DownloadListener;
import android.view.MotionEvent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

final class DesktopBrowser {
    interface Listener {
        void onPageState(String address, String status, boolean canGoBack, boolean canGoForward);
    }

    interface DownloadTarget {
        void offer(String url, String userAgent, String disposition, String mimeType);
    }

    private final FrameLayout frame;
    private final View anchor;
    private final Listener listener;
    private final DownloadListener downloads;
    private final Runnable interaction;
    private WebView view;
    private String failedAddress;

    DesktopBrowser(FrameLayout frame, View anchor, Listener listener,
                   DownloadTarget download, Runnable interaction) {
        this.frame = frame;
        this.anchor = anchor;
        this.listener = listener;
        this.downloads = (url, agent, disposition, type, length) -> download.offer(url, agent, disposition, type);
        this.interaction = interaction;
    }

    void navigate(String address) {
        Uri uri = Uri.parse(address).normalizeScheme();
        if (!isWeb(uri)) {
            listener.onPageState(address, "Enter a valid web address.", false, false);
            return;
        }
        ensureView().loadUrl(uri.toString());
    }

    void command(String command) {
        if (view == null) return;
        switch (command) {
            case "back": if (view.canGoBack()) view.goBack(); break;
            case "forward": if (view.canGoForward()) view.goForward(); break;
            case "refresh": view.reload(); break;
            case "close": close(); break;
        }
    }

    void place(int left, int top, int width, int height) {
        if (view != null) placeOverlay(anchor, view, left, top, width, height);
    }

    static boolean placeOverlay(View anchor, WebView view, int left, int top, int width, int height) {
        int right = Math.min(anchor.getWidth(), left + width);
        int bottom = Math.min(anchor.getHeight(), top + height);
        left = Math.max(0, left);
        top = Math.max(0, top);
        if (right <= left || bottom <= top) {
            view.setVisibility(View.GONE);
            return false;
        }
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) view.getLayoutParams();
        if (params.width != right - left || params.height != bottom - top
                || params.leftMargin != left || params.topMargin != top) {
            params = new FrameLayout.LayoutParams(right - left, bottom - top, Gravity.TOP | Gravity.LEFT);
            params.leftMargin = left;
            params.topMargin = top;
            view.setLayoutParams(params);
        }
        view.setVisibility(View.VISIBLE);
        return true;
    }

    void close() {
        if (view == null) return;
        WebView closing = view;
        view = null;
        failedAddress = null;
        frame.removeView(closing);
        closing.stopLoading();
        closing.destroy();
    }

    private WebView ensureView() {
        if (view != null) return view;
        WebView browser = new WebView(frame.getContext());
        view = browser;
        browser.setBackgroundColor(Color.WHITE);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setGeolocationEnabled(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        browser.setWebChromeClient(new WebChromeClient());
        browser.setDownloadListener(downloads);
        browser.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) interaction.run();
            return false;
        });
        browser.setOnKeyListener((view, code, event) -> {
            interaction.run();
            return false;
        });
        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView source, WebResourceRequest request) {
                return !isWeb(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView source, String address, Bitmap favicon) {
                failedAddress = null;
                update(source, address, "Opening page…");
            }

            @Override
            public void onPageFinished(WebView source, String address) {
                if (!address.equals(failedAddress)) update(source, address, "Done");
            }

            @Override
            public void doUpdateVisitedHistory(WebView source, String address, boolean isReload) {
                if (source.getProgress() == 100 && !address.equals(failedAddress)) update(source, address, "Done");
            }

            @Override
            public void onReceivedError(WebView source, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                failedAddress = request.getUrl().toString();
                update(source, failedAddress, "Page unavailable. " + error.getDescription());
            }

            @Override
            public boolean onRenderProcessGone(WebView source, RenderProcessGoneDetail detail) {
                if (source == view) {
                    close();
                    listener.onPageState("", "The page stopped. Enter the address again to reopen it.", false, false);
                }
                return true;
            }
        });
        browser.setVisibility(View.GONE);
        frame.addView(browser, new FrameLayout.LayoutParams(0, 0, Gravity.TOP | Gravity.LEFT));
        return browser;
    }

    private void update(WebView source, String address, String status) {
        if (source != view || !isWeb(Uri.parse(address))) return;
        listener.onPageState(address, status, source.canGoBack(), source.canGoForward());
    }

    private static boolean isWeb(Uri uri) {
        return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                && uri.getHost() != null && !uri.getHost().isEmpty();
    }
}
