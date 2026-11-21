# Roadmap

## Current development: v2.9 DOS Gaming Deluxe (experimental)

- [x] Native WebView fullscreen with in-app restore and Android Back support
- [x] Auto/Landscape/Portrait orientation preference for fullscreen
- [x] Remappable fullscreen on-screen touch buttons, drag positions, size, transparency
- [x] HTML Gamepad API button mappings and left analog stick directions, saved per package
- [x] Per-package CPU, Sound Blaster/IRQ and screen scaling presets
- [x] New browser/input/profile regression tests
- [ ] Real phone tests for WebView overlay, touchscreen, Android Back and external gamepads
- [ ] Improved game cover gallery, favorites and recently played
- [ ] True analog mouse controls, joystick emulation and HID fallbacks
- [ ] Stable signed Android release after device testing

## Lua Studio

Lua Studio phases 1–6 remain in development. The integrated build includes controls, dialog APIs, debugging, file storage, published Lua apps, and per-app SQLite. See `docs/LUA_STUDIO_PHASE6.md` and the draft development pull requests for status.

## Release gates

1. All `node tests/*.test.js` tests pass.
2. Android GitHub Actions build succeeds and the package is signed and ZIP aligned.
3. Test on Android device as default launcher, with real game audio and touch input.
4. Ensure game files survive Save/Close and a launcher restart.
5. Reconcile signing certificate before an in-place update; otherwise uninstall the existing app only after exporting important data.
