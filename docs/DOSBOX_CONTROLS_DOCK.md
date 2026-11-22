# DOS Gaming Deluxe v2.9.2 — Controls below the screen

## User-facing fix

The DOS game image is anchored to the **top** of the fullscreen view. The fullscreen/desktop switch, the ESC key, game setup, and all draggable touch controls are now in a separate black control dock **after the game image**, never absolutely positioned on top of DOS pixels. In portrait, any unused screen space remains black below the controls. In landscape, the display is sized to leave room for the dock.

- **ESC:** fixed in the bottom action toolbar; remains visible even when optional touch buttons are hidden. It is a press-and-hold key, not an immediate toggle.
- **Desktop:** returns to windowed mode from the bottom toolbar.
- **D-pad, A, B, Shift, Start:** movable within the black control panel, with portrait and landscape coordinates remembered independently.
- **Setup:** accessible below the game.
- **Shift:** remains independently holdable while pressing another direction/action.
- **Legacy game profiles:** custom key mappings, audio settings and CPU settings remain. Old v1/v2 on-screen positions reset once to dock-friendly defaults because their coordinates belonged to the fullscreen viewport, not the new dock. New positions are saved using layout version 3.

## Test evidence

Source tests: `node tests/dosbox-deluxe.test.js` and `node tests/dosbox-audio.test.js`.

Browser geometry smoke tests in Chromium covered **360 × 780**, **720 × 1520**, **780 × 360**, and **1520 × 720** CSS pixel viewports. Every test checked that the DOS image begins at the top; the ESC button, Desktop button, touch controls, and toolbar are below the DOS image; and the dock fits within the viewport. ESC key dispatch and fullscreen restoration were also exercised.

Still requires physical Android device testing to verify multitouch, orientation handling, gamepad integration, and usability in Jill of the Jungle.
