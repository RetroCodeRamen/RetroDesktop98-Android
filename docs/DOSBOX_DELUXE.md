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
