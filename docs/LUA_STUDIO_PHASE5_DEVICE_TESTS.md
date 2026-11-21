# Lua Studio Phases 1–5 — Android Device Test Checklist

Test on **Retro Desktop 98 (Beta)**. Do not uninstall your stable launcher.

**Capture:** Phone model / Android version / APK version / orientation / steps to reproduce / actual vs. expected / screenshot. Check items as Pass, Fail, or Not tested.

## 1. Install and launch (5 minutes)
- [ ] Beta APK installs without removing regular Retro Desktop 98.
- [ ] Regular launcher remains installed and still opens with its original shortcuts and files.
- [ ] Open **Retro Desktop 98 (Beta)** from the app drawer; default Home app need not change.
- [ ] Start menu, taskbar and built-in windows display correctly in portrait.
- [ ] Rotate to landscape and back: windows remain usable; no blank screen or crash.

## 2. Lua Studio and form designer (10 minutes)
- [ ] Start → Programs → Lua Studio opens.
- [ ] Create a new project, name it `MobileTest`, add Label, TextBox, and CommandButton to Form1.
- [ ] Select, drag, resize, and rename controls using Properties.
- [ ] Undo / Redo restores and re-applies those actions.
- [ ] Copy/Paste a control creates a second, uniquely named control.
- [ ] Use Format → Align and make the controls the same width.
- [ ] Save, close Studio, reopen project: form layout and code survive.
- [ ] Create a second form; switch between forms without losing edits.

## 3. Editor and mobile keyboard (10 minutes)
- [ ] Open Code view and type several lines, including comments, strings, and `function Form_Load()`.
- [ ] Syntax highlighting follows the text while typing and scrolling (no ghost or doubled characters).
- [ ] Android keyboard suggestions, Backspace, Enter, long-press selection and Paste work.
- [ ] Switch between portrait/landscape with keyboard visible. No important editor controls become permanently inaccessible.
- [ ] Test Tab and Shift+Tab indentation with external keyboard if available.
- [ ] Use Functions… to jump to a function definition.
- [ ] Use Suggest / Source → Complete Symbol… to insert `ui.set`.
- [ ] Check detects a deliberately unmatched bracket; fix it and verify warning disappears.
- [ ] Set breakpoint and run; Step/Continue and Locals/Watch behave without freezing the desktop.

## 4. Forms and events (10 minutes)
- [ ] Add code to CommandButton's Click event to update a Label; run and tap it.
- [ ] Change TextBox text: `Change` handler fires while typing.
- [ ] Open **Examples → Control Arrays** and run. Different buttons deliver different indexes.
- [ ] Open **Examples → Modal Dialog**. Background forms cannot be interacted with until dialog is dismissed.
- [ ] Use `DblClick` or mouse/keyboard handlers with physical keyboard/mouse if available.

## 5. Common controls and dialogs (10 minutes)
- [ ] Open **Examples → Common Controls**.
- [ ] TreeView expands/collapses nested paths; selecting a node updates the event target.
- [ ] ListView displays multiple columns and selects the intended row.
- [ ] TabStrip and Toolbar selection handlers fire; StatusBar updates.
- [ ] Open **Examples → Common Dialogs**: test Message, Confirm (Accept and Cancel), Input, and Color.
- [ ] Open/Save file dialog accepts a name like `TestNotes.txt` and rejects path-like names such as `../other.txt`.
- [ ] Close a dialog using its X: a single cancellation is delivered, no stuck modal window.

## 6. Files, persistence and publishing (10 minutes)
- [ ] Open **Examples → Pocket Notepad (Files)**; save and reload a note in Run preview.
- [ ] Restart the preview: its temporary note storage should reset.
- [ ] Publish using **File → Make Application…**; enter a name, version `1.0.0`, description.
- [ ] Verify the app appears in Start → Programs → Lua Programs and launches.
- [ ] Save `TestNotes.txt` from published app; close and reopen: it still exists.
- [ ] Check built-in Explorer at `C:\Lua Projects\AppData\` for the published app's private folder.
- [ ] Try **Examples → Reusable Class Demo**; run and increment its counter.
- [ ] Republish the same app at version `1.0.1`; saved app data should persist.
- [ ] Verify two published apps do not see each other's files or settings.

## 7. Stability and regression (5–10 minutes)
- [ ] Rapidly open, minimize, maximize, resize, and close Lua Studio and preview windows.
- [ ] Repeat Run → Stop → Run at least five times.
- [ ] Kill and restart Beta once; saved projects and published-app data persist.
- [ ] Launch Notepad, Calculator, Windows Explorer and Minesweeper to catch unrelated regressions.
- [ ] If you use DOSBox, launch a known game and check sound and controls.
- [ ] Return to the stable launcher, confirm it still has original data.
- [ ] Uninstall Beta if desired; stable launcher and its data remain intact.

## Bug report template
```text
Test:
Result: PASS / FAIL
Device & Android:
APK: Retro Desktop 98 (Beta), 2.7-phase5-beta
Orientation: Portrait / Landscape
Steps:
Expected:
Actual:
Reproducibility: Always / Sometimes / Once
Screenshot or log:
```

### Important limits
Lua Studio is a Lua-based VB6-inspired environment—not a Windows VB6 language/compiler, native EXE exporter, or COM/ActiveX implementation. File names must be a single permitted text-file basename; files are limited to 16 KiB, 32 files per published app. Preview files are temporary.
