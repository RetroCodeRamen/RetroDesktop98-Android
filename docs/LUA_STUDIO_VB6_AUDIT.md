# Lua Studio ↔ Visual Basic 6 — feature audit

> **Audit baseline:** Retro Desktop 98 v2.7 source, 2026-11-21. **Phase 1, Phase 2 and Phase 3** below describe experimental code on the `feature/lua-studio-vb6-phase1` branch, not a released Android APK. **VB6-inspired** means similar workflow, **not** the Visual Basic 6 language or Windows binary compatibility.

VB6 shipped a full IDE, programming language, Windows runtime, developer tools and COM/ActiveX ecosystem. Lua Studio currently uses sandboxed LuaJ, a HTML/CSS form renderer and a small JSON project model, so it cannot honestly be called “full VB6” until distinct layers are implemented and tested. No existing `.vbp`, `.frm`, `.bas`, `.cls`, `.ocx`, or compiled VB6 `.exe` is executed by this project.

## Coverage legend

- **✓** Implemented on the v2.7 source baseline.
- **+** Implemented or expanded on this development branch; needs Android device testing.
- **◐** Partial / differs substantially from VB6.
- **—** Not implemented.
- **N/A** Requires Windows-native interoperability; emulate concepts instead of claiming binary support.

| VB6 feature | Lua Studio coverage | Concrete behavior / gap |
| --- | --- | --- |
| Integrated designer, Toolbox, Properties | ✓ | Controls on resizable forms; touch drag/resize; Properties page. Inspector is not fully dockable. |
| Project Explorer / startup form | ✓ | Multiple form and module files; select startup form; rename and remove. Maximum 8 forms / 12 modules. |
| Menu Editor | ✓ | Top-level and one-level dropdown menus; code events. Missing separators, shortcuts, nested submenus and checked items. |
| Object and Procedure dropdowns | + | Code pane now has separate Object and Event selectors and generates a handler stub. |
| Undo / Redo in designer | + | Project-wide bounded history (designer edits, properties, menus and typed source); consecutive typing grouped; no disk history. |
| Cut / Copy / Paste controls | + | Multiple selected controls can be copied between forms; pasted controls receive unique names. Clipboard is **internal**, not Android's global clipboard. |
| Format / Align controls | + | Left, right, top, bottom, horizontal/vertical center, width, height, size, distribute horizontal/vertical. |
| Multi-select and snap-to-grid | ✓ | Shift-selection or multi-select mode, grid toggle and 4px snapping. No guides or grid-size preferences. |
| Tab Order | ✓ | Per-control tabIndex and tabStop, keyboard traversal in preview. No visual tab-order editing mode. |
| Source editor | ◐ | Plain text editor, gutters, breakpoints, find/replace, go to line, tab indentation, F4/F5/F7/F8/F9. Missing completion, syntax colors, bookmarks, outlining, full/procedure view and split editor. |
| Syntax check / compile errors | ◐ | Lua script compilation on Run, execution and error output. No static whole-project type-checking or VB6 syntax checking. |
| Breakpoints / step in, over, out | ✓ | LuaJ debug hook with instruction limits and pause snapshots. No edit-and-continue. |
| Watches / Locals / Call Stack | ✓ | Debug panes with variables and stack snapshots, up to 12 watched names; expression evaluation is not implemented. |
| Immediate window | ◐ | `print()` output and errors; not an interactive Lua evaluator or assignment console. |
| Form_Load, Activate, Unload | ✓ | Existing form navigation lifecycle. Cancellation and query-unload semantics are absent. |
| Control Change, Click, Timer | ✓ | Core events dispatch to named Lua handlers. |
| DblClick, MouseDown/Up, KeyDown/Up, focus events | + | WebView now sends scoped event data to the sandboxed Lua runtime. Event Playground sample included. Does not yet replicate VB6 key-code/Shift parameter conventions or offer low-latency MouseMove. |
| Form-level pointer/key events | + | Background form pointer events and key events when form background has focus; not complete KeyPreview semantics. |
| Event arguments | + | `event.key`, `event.code`, `event.x`, `event.y`, `event.button`, `event.shift`, `event.ctrl`, `event.alt`. Change handlers keep `value`. |
| Standard intrinsic controls | ◐ | Label, CommandButton, text/multiline text, CheckBox, OptionButton, ComboBox, ListBox, Frame, H/V ScrollBar, Timer, Image, PictureBox, Shape, Line; missing DriveListBox, DirListBox, FileListBox, intrinsic Data control and OLE Container. |
| Windows common controls (`MSCOMCTL.OCX`) | + | Added functional TreeView (path indentation), ListView (list-style), TabStrip, Toolbar, and StatusBar along with item selection events. These are lightweight native launcher controls—not full MSCOMCTL.OCX or hierarchical/tree binding/owner draw. ImageList, rich columns, slider and others remain. |
| Control arrays (shared name + Index) | + | Static array groups now use an optional `arrayName`/`arrayIndex` while retaining unique internal control IDs; indexed `ui.getAt`/`ui.setAt` and `ArrayName_Click(index,event)` handlers. Runtime dynamic Load/Unload not supported. |
| Dynamic controls / Load/Unload | — | Designer produces static controls; runtime cannot add controls dynamically. |
| MDI parent/child | — | Runtime supports **multiple separate forms**, not an MDI parent workspace. |
| Form modal/modeless display | + | `ui.showModal(form)` disables other forms in the same Lua session, allows nested dialogs, and restores input after dismissal. It is asynchronous, unlike VB6 blocking `Show vbModal`. |
| Common Dialog / MsgBox / InputBox | + | `ui.dialog(kind,title,message,default)` shows message, confirm, input and color dialogs inside the launcher, returning asynchronously via `Form_DialogResult(event)`. Not VB6 synchronous `MsgBox`; file/font dialogs are still absent. |
| Class modules / interfaces / WithEvents | — | Shared modules exist; no class/module object model or typed event declarations. |
| File I/O | — | Scripts still have **no disk access**. A new bounded `store.get/set/remove` key-value API persists simple settings for published programs only; it is not general file I/O. |
| Networking and database controls | — | No ADO/DAO/RDO, Winsock/Inet, or bound data controls inside scripts. |
| Package/reference manager | — | No external Lua module manager or user-defined controls. |
| Resource editor & image lists | ◐ | Embedded JPEG project images; no icons/string tables/version information or resource editor. |
| Project templates / wizard / add-ins | + | Existing examples plus Control Arrays, Modal Dialog, Common Controls and Common Dialogs. No plugin or add-in API. |
| Export published app | ✓ | Save project / ZIP and publish a Lua app under Start → Lua Programs. |
| Compile native Win32 EXE / DLL / OCX | N/A | Android launcher hosts Lua inside its sandbox. Windows VB6 binaries and COM are not supported. |
| Windows API calls / Declare / OLE automation | N/A | Deliberately not exposed to untrusted Lua; would compromise Android app isolation. |
| Pixel-perfect VB6 design coordinates (twips) | — | Current dimensions are CSS pixels, not VB6 twips or scale modes. |
| Localization / accessibility / DPI scaling | ◐ | Accessible labels and compact phone layouts; no localization designer or fully validated Android accessibility pass. |

## Architecture observations

- **Project format:** `app/src/main/assets/lua-project.js` has versioned JSON with v1→v2 migration. Each form has at most 48 controls and a 60k-character Lua source file, and total projects are capped around 220k serialized characters. This prevents an unbounded IDE but limits large applications.
- **Designer:** `lua-studio.js` runs inside a WebView. Existing projects are autosaved in the launcher workspace. Current program export is a copy, not compilation into an APK.
- **Renderer:** `lua-preview.js` creates regular launcher windows for forms; shell windows can move/resize but runtime controls are fixed to form coordinates. Mouse and keyboard events now have bounded, serializable details.
- **Runtime:** `LuaStudioRuntime.java` is a dedicated sandboxed LuaJ service process; limits execution, code size, outputs and UI patches. Its restricted API contains `ui.get`, `ui.set`, `ui.show`, `ui.hide`, `ui.unload`, `ui.message`, `shared`, `print` and basic Lua libraries.
- **Debugger:** `LuaStudioDebugger.java` tracks interpreted frames; breakpoints, watches, stepping and time/instruction budgets are present, but changing variables during a pause and evaluating expressions are missing.

## Proposed parity plan

### Phase 1 — IDE fundamentals (+ in this branch)

- [x] Project-wide Undo/Redo with copy/paste of form controls
- [x] Extended Format commands
- [x] Real Object / Event code-window selectors
- [x] More event handlers and an Event Playground example
- [x] Preserve v1/v2 project load format and existing Change callback values
- [ ] Real-device touch/keyboard and LuaJ integration smoke tests

### Phase 2 — Build real applications

1. [x] Implement **static control arrays** using stable internal control names, shared `(arrayName, index)` routing, indexed APIs, and migration tests. Dynamic loading remains open.
2. [x] Add **asynchronous modal forms** with nested modal input gating in both preview and LuaJ runtime. QueryUnload, Resize, Form KeyPreview and focus-management parity remain open.
3. [ ] Implement a permission-bounded `workspace` module (read/write/list under `C:\Lua Projects`), plus native file picker services with asynchronous continuation semantics.
4. [ ] Build **CommonDialog**, **MsgBox**, **InputBox**, dialogs and dynamic controls; asynchronous interaction must not block the UI thread.
5. [ ] Implement a richer intrinsic/common-control gallery, container ownership/z-order, tree/list/grid/tab/toolbar/status controls, and properties/events.

### Phase 3 — VB6-quality development tools

- Source syntax highlighting, safe symbol completion, bookmarks, procedure picker, full/procedure view and split panes.
- Immediate evaluation in a sandboxed paused frame, watch expressions and condition breakpoints.
- Form layout thumbnail, categorized Properties, keyboard designer nudging, visual Tab Order and designer guides.
- Class modules, component contracts and importable Lua packages with controlled capabilities.
- Data binding through an **Android-local SQLite abstraction** rather than Windows ADO/DAO or an untrusted `java` bridge.
- Build/export pipeline for shareable launcher-native Lua project packages and automated tests.

### Phase 3 — Common controls, asynchronous dialogs and app settings (+ on this branch)

- [x] TreeView, ListView, TabStrip, Toolbar, StatusBar in designer and runtime preview, with item selection and bound Change events.
- [x] `ui.getItems`/`ui.setItems` for bounded, dynamic item lists; retain the existing v2 project schema and old controls.
- [x] `ui.dialog` for message, confirmation, text input, and color selection, with `Form_DialogResult(event)` for asynchronous response.
- [x] `store.get/set/remove` for per-published-program settings with 32 keys and 256 characters per value. Studio preview storage is temporary. This is **not** file system access.
- [x] Node compatibility tests, Chromium control-render smoke test, dialog event queue and persistence simulations.
- [ ] Android compilation and real-device dialog/touch/input checks before merging or releasing.
- [ ] Implement workspace-scoped file I/O, native file/font dialogs, richer ListView columns and hierarchical TreeView nodes.

See [Phase 3 guide](LUA_STUDIO_PHASE3.md) for the actual Lua APIs and examples.

### Windows compatibility boundary

Avoid advertising original `.frm/.vbp` import or binary `.ocx/.exe` execution. A *translator* from a documented subset of `.frm` form layout to Lua Studio JSON could be built as a separate import tool, with unsupported properties reported explicitly. This is not the same as a VB6 interpreter.

## Phase 2 acceptance checklist

- [x] `node tests/lua-studio-compat.test.js` covers project arrays, event signatures, malformed index rejection, migration, and modal preview input gating.
- [x] `node tests/dosbox-audio.test.js` remains passing.
- [x] `node --check` passes the changed JavaScript.
- [ ] GitHub Actions must compile and test the Phase 2 Android app and LuaJ source.
- [ ] Verify on a real Android device that array handlers actually fire in LuaJ, indexed API patches update the expected control, and modal dismissal restores focus.
- [ ] Verify the already-installed v2.7 update signing key before shipping a public APK.

For API examples and design details, see [Phase 2 guide](LUA_STUDIO_PHASE2.md).

## Original Phase 1 acceptance checklist

- [x] `node tests/lua-studio-compat.test.js` (source model, events, migration examples)
- [x] `node --check` on changed JavaScript
- [ ] Android Debug APK built successfully from this branch
- [ ] Verify Save/Open, menus, two forms, Event Playground and breakpoints on a physical 360dp-wide display
- [ ] Verify `KeyDown`/`DblClick` with touchscreen, Bluetooth keyboard and a USB mouse
- [ ] Confirm the **existing** v2.7 install data remains intact after a separately signed test build

## Reference links

- [Microsoft: Visual Basic 6 documentation](https://learn.microsoft.com/en-gb/previous-versions/visualstudio/visual-basic-6/visual-basic-6.0-documentation)
- [Microsoft KB Q194784: intrinsic/ActiveX controls shipped in VB6](https://jeffpar.github.io/kbarchive/kb/194/Q194784/)
- [Microsoft: Code window objects and procedure selectors](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/code-window)
- [Microsoft: Object Browser](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/use-the-object-browser)
- [Microsoft: View menu / IDE windows](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/view-menu)
