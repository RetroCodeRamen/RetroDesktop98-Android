# Roadmap

## Current baseline: v2.7 (Android install-alignment repaired)

This repository begins with the v2.7 source that was confirmed to install successfully on the target phone. The launcher includes the DOSBox audio update, Sound Blaster 16 configuration and the directional touch pad. v2.8 features below are *not yet implemented*.

## v2.8 — DOS Gaming Deluxe (planned)

- [ ] True fullscreen DOSBox rendering with a clear return-to-windowed control
- [ ] Per-game Bluetooth/USB gamepad button mapping and saved profiles
- [ ] Customizable touch control positions and button layouts per game
- [ ] Virtual mouse for point-and-click adventures
- [ ] Per-game CPU, SB16/AdLib and scaling settings
- [ ] Persist game files reliably and test control mapping with real games

## Release gates

1. Check the included source test: `node tests/dosbox-audio.test.js`.
2. Build with the Android SDK and compare signature certificate with the last installed APK.
3. Verify native `.so` libraries are 16 KiB aligned and `resources.arsc` is 4-byte aligned, then run `python3 tests/check_apk_package.py PATH_TO_APK`.
4. Actually install as an update on Android and confirm launching as default Home app.
5. Smoke-test games, audio, touchscreen and external gamepad before publishing a release.
