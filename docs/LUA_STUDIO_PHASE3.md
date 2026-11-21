# Lua Studio Phase 3 — Common Controls, Common Dialogs and Published-App Settings

> Experimental code on `feature/lua-studio-vb6-phase1`. **Not** a released, tested APK. Android UI behavior still needs device testing. Existing version-1 and version-2 Lua Studio projects continue to load; the saved project schema remains `version: 2`.

This phase brings a useful slice of the VB6 toolbox to a phone-sized IDE while keeping the LuaJ service isolated from Android and WebView internals.

## Common Controls

The designer Toolbox now contains **TreeView, ListView, TabStrip, Toolbar and StatusBar**. Use the Properties panel to define their contents and selection. The current set deliberately stays simple and phone-friendly:

| Control | Main property | User event | Implementation |
| --- | --- | --- | --- |
| TreeView | `value` | `Tree1_Change(value)` | Selectable folder-like paths, shown with indentation for `/` separators |
| ListView | `value` | `ListView1_Change(value)` | Single-column selectable items |
| TabStrip | `value` | `TabStrip1_Change(value)` | Horizontal selectable tabs; no automatic child-container switching |
| Toolbar | `value` | `Toolbar1_Change(value)` | Labeled action buttons; `Change` identifies the chosen button |
| StatusBar | `text` | Pointer events | Beveled status text, changeable by Lua |

Each selected item is a string. New choices can be supplied at runtime:

```lua
function Form_Load()
  ui.setItems("Tree1", "Projects\nProjects/Lua Studio\nProjects/DOSBox")
  ui.set("Status1", "text", "Ready")
end

function Tree1_Change(value)
  ui.set("Status1", "text", "Selected: " .. value)
end
```

`ui.getItems("Tree1")` returns a newline-separated string. Both functions accept an optional form name (`ui.setItems(name, items, form)`). At most **24 distinct items** are permitted, each at most **60 characters**. `ui.setItems` never evaluates source strings or accepts HTML markup. These are *VB6-inspired controls*, **not** feature-complete `MSCOMCTL.OCX` controls: TreeView has no expandable node hierarchy API and ListView has no column/checkbox/subitem engine yet.

Try **Lua Studio → Examples → Common Controls**.

## Common dialogs (nonblocking)

The new `ui.dialog(kind, title, message, defaultValue)` supports the four bounded dialog kinds:

- `"message"` — an OK-only message box
- `"confirm"` — OK / Cancel confirmation
- `"input"` — text input, with an optional suggested value
- `"color"` — color input (`#RRGGBB`), with an optional suggested color

Calling it returns a numeric request ID immediately. The project receives the answer in `Form_DialogResult(event)` on **the form that requested the dialog**. This is different from VB6's synchronous `MsgBox`/`InputBox` return value. Event fields are `event.id` (integer), `event.kind` (string), `event.accepted` (boolean), and `event.value` (string).

```lua
function AskButton_Click()
  ui.dialog("input", "Your Name", "What should I call you?", "Ada")
end

function Form_DialogResult(event)
  if event.accepted and event.kind == "input" then
    ui.set("AnswerLabel", "text", "Hello, " .. event.value)
  else
    ui.set("AnswerLabel", "text", "Canceled")
  end
end
```

Events on the form are temporarily blocked while its common dialog is showing. Dialogs use the launcher's own resizable Windows-style windows instead of exposing Android activities or Java reflection. Dismissal through Cancel, Escape or the title bar sends exactly one canceled result. No native disk or font chooser is implemented in this phase.

Try **Lua Studio → Examples → Common Dialogs**.

## Small, persistent settings for *published* Lua programs

`store.get(key)`, `store.set(key,value)` and `store.remove(key)` let a Lua program retain simple string preferences. This store is **not a disk/file API** and should never be used for credentials or private secrets.

```lua
function Form_Load()
  local previous = store.get("nickname")
  if previous then ui.set("NameBox", "text", previous) end
end

function SaveButton_Click()
  store.set("nickname", ui.get("NameBox", "text"))
  ui.message("Saved")
end
```

- **Published** programs have a unique `lua-user-...` ID, and each program has its own settings bucket. Changes persist across program restarts through launcher's app-local WebView storage.
- A **Studio preview** gets temporary storage for the current run and cannot overwrite the published app's settings.
- Values are strings of at most **256 characters**; keys must be alphanumeric/underscore/dash identifiers beginning with a letter and at most **32 characters**; at most **32 keys** per program.
- Removing a published Lua program also deletes its settings bucket. Uninstalling the Android launcher can delete all stored project settings.
- Data is not encrypted, not backed up by the desktop-layout backup and is unavailable to other Android apps.

## Safety and testing

The isolated LuaJ runtime exposes only explicit Lua functions—no `java`, COM, ActiveX, subprocesses, Android permissions, arbitrary workspace paths or browser network APIs. Per-event limits apply to dialog requests and control updates. The WebView checks response IDs, dialog kinds and target forms.

Tests: `node tests/lua-studio-compat.test.js` exercises project migration, control validation, native API markers, dialog routing, and persistence. `node tests/dosbox-audio.test.js` protects existing DOSBox behavior. An isolated Chromium render smoke checked tabs, lists, status bar and dialog submission. **These do not replace Java compilation or a real Android test.**

## Still to implement

Actual folder-scoped file APIs in `C:\Lua Projects`, Open/Save and font dialogs, rich ListView columns and TreeView nodes, ImageList, MDI, class modules, dynamic controls, data binding and interactive Immediate evaluation. These are separate engineering tasks; this phase does not claim full Visual Basic 6 compatibility.
