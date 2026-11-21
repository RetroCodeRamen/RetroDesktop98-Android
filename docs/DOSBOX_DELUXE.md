# DOS Gaming Deluxe — v2.9 development preview

> Experimental build on `feature/dos-gaming-deluxe-v29`. Not yet a device-verified release. Built on the Lua Studio Phases 1–6 integration branch and uses the **regular** Android app ID (`com.retrodesktop.launcher.resizable`) with a development signing key.

## What works in this implementation

- **True WebView fullscreen:** DOSBox's native WebView expands over the home desktop. Tap **Fullscreen** in the game toolbar or DOSBox window. The fullscreen bar includes **Desktop** to return to the window, and Android Back also restores. The launcher normally hides only the status bar; fullscreen also hides the navigation bar when Android allows it.
- **Orientation:** Choose Auto, Landscape, or Portrait for fullscreen. The app restores its previous requested orientation when leaving fullscreen.
- **On-screen controls:** The original windowed keyboard and D-pad remain. Fullscreen adds an eight-button transparent game overlay (four directions, A, B, Start, Esc). Under **Controls / Setup**, remap each button to an ordinary DOS keyboard key or mouse left/right. Use **Move Touch Buttons** to drag each control, and change the button size/opacity. Settings save immediately.
- **USB/Bluetooth Gamepad API:** When Android System WebView exposes a gamepad, DOSBox polls it via `navigator.getGamepads()`. Buttons, D-pad and left-stick directions generate DOS keyboard events. Gamepad buttons can be remapped per game and left-stick deadzone adjusted. Input is released when the controller disconnects, the game pauses, or the WebView loses visibility. Some controllers may be exposed as hardware key events instead of Gamepad API input; support varies by Android device and WebView.
- **Per-game profiles:** Settings are stored as bounded JSON in the DOSBox WebView's app-local storage, keyed by the SHA-256 digest of the imported ZIP/DOSZ/JSDOS package. The original DOSBox demo has its own profile. If you import a modified archive, that is a different profile. Screenscale and touch controls apply immediately; CPU cycles and SB settings take effect the next time the game launches.
- **CPU / audio presets:** CPU `auto`, `max` or fixed 3,000/6,000/12,000/20,000 cycles; SB16, SB Pro 2, or no Sound Blaster; IRQ 7 or 5. Existing game autoexec sections are retained. AdLib/OPL and mixer settings still follow the current engine defaults.
- **Safety:** Profile values are allowlisted and size-bounded, not arbitrary DOSBox config lines. Source package validation, file import quotas and game disk save behavior from v2.7 remain intact.

## Play a game

1. Open **Start → Programs → DOSBox**, then **Demo**, **Import Game**, or choose a compatible file in `C:\DOS Games`.
2. Tap **Fullscreen**. Tap **Enable Sound** inside DOSBox once per new WebView session if your Android version requires a direct gesture to unlock audio.
3. Tap **Controls / Setup** at the top. Select **Landscape** if preferred and configure the on-screen and gamepad mapping for that game.
4. Tap **Move Touch Buttons**; drag buttons to comfortable locations and tap **Done Moving Controls** to save positions.
5. Tap **Desktop** to restore the original desktop window. The Android Back gesture/button also restores it.

## Example game controls

| DOS game | Suggested buttons |
| --- | --- |
| Jill of the Jungle | D-pad = Arrows; A = Space (jump); B = Ctrl; Start = Enter |
| Commander Keen | D-pad = Arrows; A = Ctrl (jump); B = Alt (pogo); Start = Enter |
| The Incredible Machine | Consider touch/mouse mode. Tap the actual game canvas for left-click; **Right Click** is available in the windowed toolbar |

These are examples, not built-in presets. Actual control keys vary by game and game setup.

## Test gates

- `node tests/dosbox-audio.test.js` — existing SB16 and touch-key behavior.
- `node tests/dosbox-deluxe.test.js` — bounded profiles, config preservation, fullscreen bridge and input.
- `python tests/dosbox-deluxe-browser.py` — optional self-contained Chromium test exercising profile persistence, fullscreen UI, touch remapping, mock gamepad button/analog presses and releases. It **does not** run the actual DOSBox emulator.
- Existing Lua Studio and Phase 6 regression tests, Android compilation, APK signing, and archive alignment checks.

## Deliberately not shipped yet

- A newly designed game-cover gallery/favorites/recently played library.
- Full native HID remapping for controllers invisible to `navigator.getGamepads()`.
- Joystick port emulation beyond keyboard/mouse mapping, multitouch gesture macros, analog cursor/mouse mode.
- A per-game save-state/snapshot function; **Save Game Files** still saves the emulated DOS disk.
- Live CPU/IRQ changes during a running emulator session.
- Testing on actual Android phones and physical Bluetooth/USB controllers.

**Release note:** This build uses a new development signing key. Android generally cannot update your currently signed installation in place. If your old launcher is disposable, uninstall it and install the new APK. Back up the workspace first if anything changed since your last decision to wipe it.

## v2.9.1 — ergonomic controls and top-aligned fullscreen display

- A dedicated **Shift** key is available both in windowed play and on the fullscreen touch overlay. Hold Shift and a direction or action together to send simultaneous key-down events (useful for Jill of the Jungle).
- The regular window uses a full four-way, three-row diamond D-pad with a separate, highlighted Shift key; fullscreen action keys use compact labels and their current mappings remain available in Game Settings.
- Fullscreen **DOS video is aligned to the top** of the display instead of letterboxing vertically in the center. The display preserves the original aspect ratio under Fit and resizes when DOS changes video mode or the phone rotates.
- Touch button positions have distinct portrait and landscape presets. The D-pad is at the left; A/B/Shift are at the right; Esc is at the top left to avoid colliding with the compact Desktop/Setup toolbar.
- **Game Settings → Reset Touch Positions** restores both orientation layouts without deleting the game's key mappings or sound settings. Existing manually customized portrait positions are preserved during migration; untouched v2.9 defaults migrate to the improved layout.
- Fullscreen touch controls remain movable per game. Settings persist per DOS game package; the existing gamepad mappings and CPU/audio profiles are unchanged.

The Android release remains development-signed: if your previous APK used another signing certificate, uninstall that app before installing this build. This version has not been physically tested with Jill of the Jungle or a Bluetooth gamepad. Node and browser smoke tests verify simultaneous Shift/Right key presses and the canvas bounding box at the top of portrait and landscape viewports.
