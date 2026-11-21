# Retro Desktop 98 — Phase 5 Side-by-Side Beta

This is a **test-only build** from the `feature/lua-studio-vb6-phase1` branch at commit `c1384a5`. It contains Lua Studio Phases 1–5 but is packaged as a **separate Android application**, `com.retrodesktop.launcher.resizable.beta`, displayed as **Retro Desktop 98 (Beta)**.

## Why a separate APK?

The regular Retro Desktop 98 package is `com.retrodesktop.launcher.resizable`. The CI development signing key cannot update its signed v2.7 installation. A different app ID means the beta can be installed alongside your working launcher without replacing its data. Both launchers may appear in Android's Home app settings. **Leave your current launcher selected while testing the beta.**

## Install

1. Download the APK artifact from the GitHub Actions run for this branch, extract the APK, and open it on your Android device.
2. Allow your browser or file manager to install APKs if Android prompts.
3. Open **Retro Desktop 98 (Beta)** from the Android app list. You do **not** need to select it as the default Home app to test Lua Studio.
4. Open **Start → Programs → Lua Studio** and work through the [test checklist](LUA_STUDIO_PHASE5_DEVICE_TESTS.md).
5. When finished, uninstall **Retro Desktop 98 (Beta)** only. Its sandboxed data is separate from the regular launcher.

This beta uses a temporary signing key. Later CI builds may use a different key, requiring the beta itself to be uninstalled between builds. **Never uninstall the stable v2.7 launcher to test this APK.**

## Build changes

Only this test branch changes packaging: APK app ID, FileProvider authority, task affinity, display name, version, and Actions branch trigger. There are no changes to the Lua Studio implementation compared with Phase 5.
