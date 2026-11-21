# Lua Studio Phase 5 — Developer Experience

> **Status:** Experimental source changes on `feature/lua-studio-vb6-phase1`; the stable v2.7 APK is unaffected. This is a VB6-inspired editor for sandboxed **Lua**, not the Visual Basic 6 compiler, language runtime, COM or ActiveX. Passing Node tests does not replace testing on Android hardware.

## Professional source editing

The **Code** pane keeps its native `<textarea>` editing surface (including keyboard, touchscreen selection and Android IME), with a non-interactive highlighted mirror behind it. Lua keywords, numbers, comments and strings are colored without loading an external editor framework or sending code to a remote service. The source is HTML-escaped before it reaches the overlay.

Use **Source → Complete Symbol…**, **Suggest**, or **Ctrl+Space** to choose API names. Suggestions include bounded `ui.`, `files.`, `store.`, `math.`, `string.` helpers and functions declared in the project. Completions don't run code. The **Functions…** selector jumps to function declarations in the current file; **Check** runs quick *lexical* checks for unmatched brackets and unterminated ordinary strings. This is explicitly **not a Lua compiler or semantic type checker**: running the project remains the authoritative parse/runtime check.

The editor preserves existing line gutters, Undo/Redo, breakpoints, find/replace, and phone-friendly indentation. Its syntax overlay is temporarily disabled during IME composition to avoid disrupting input.

## Reusable class-style modules

Use **Project → Add Class** to create a class-style Lua source module with a constructor and example methods. Or open **Examples → Reusable Class Demo**. Each class module is a normal Lua file that runs in the project module environment. Constructor functions return plain Lua tables with closure-backed state:

```lua
function Counter_new(initial)
  local number = tonumber(initial) or 0
  local object = {}
  function object:increment(amount)
    number = number + (tonumber(amount) or 1)
    return number
  end
  return object
end

function Form_Load()
  shared.counter = Counter_new(0)
end

function AddButton_Click()
  ui.set("Result", "text", tostring(shared.counter:increment(1)))
end
```

This is a **factory pattern, not VB6 `Class_Initialize`/`WithEvents`** or a COM component. A `kind:"class"` label is stored for Project Explorer; older modules default to `kind:"module"` and still load. The project JSON format remains **version 2**.

## App-local Open and Save dialogs

`ui.dialog("open", title, message)` and `ui.dialog("save", title, message, defaultName)` open in-launcher file chooser windows. They operate on the same **per-program** text-file sandbox used by `files.read/write/list/remove`; they do not grant arbitrary access to Android storage or show unrestricted system file pickers.

```lua
function Open_Click()
  ui.dialog("open", "Open document", "Choose a saved note")
end

function SaveAs_Click()
  ui.dialog("save", "Save document", "Enter a file name", "notes.txt")
end

function Form_DialogResult(event)
  if not event.accepted then return end
  if event.kind == "open" then
    files.read(event.value)
  elseif event.kind == "save" then
    files.write(event.value, ui.get("Notes", "text"))
  end
end

function Form_FileResult(event)
  if event.ok and event.action == "read" then
    ui.set("Notes", "text", event.text)
  end
end
```

Open lists only files belonging to the current Lua program. Save accepts one `*.txt`, `*.csv` or `*.json` basename. The same 32-file / 16 KiB per file limits apply. Dialog results are **asynchronous** and retain the usual `event.id`, `event.kind`, `event.accepted`, and `event.value` fields.

## Make Application…

**File → Make Application…** prompts for a program name, a dotted three-number version (`1.0.0`), and a short description. It validates the project, then publishes/updates the app in **Start → Programs → Lua Programs** using the existing native `LuaProgramStore`. `LuaProgramStore.list()` now includes version and description metadata. Existing published program IDs remain stable when updated, preserving each program's separate saved data.

**This is not an APK builder.** A published program is a launcher-native JSON Lua application; the APK contains the launcher and its Lua runtime.

## Verification

```sh
node tests/lua-studio-compat.test.js
node tests/lua-studio-phase4.test.js
node tests/lua-studio-phase5.test.js
node tests/dosbox-audio.test.js
```

Phase 5 tests exercise HTML-safe highlighting, function navigation, completion candidates, lexical diagnostics, module metadata, version validation, and dialog request routing. Android compilation and real-device testing are still required before release. Check portrait keyboard/IME and scrolling alignment, dialog touch controls, LuaJ factories and persistent Start-menu app updates.

## Deferred for future phases

Full contextual IntelliSense / AST analysis, bookmarks and split panes; full classes with inheritance/events; custom icon/resource designer; folder navigation and Android storage access; a package manager; SQLite/ADO-style controls; and a native Windows `.exe` or standalone Android `.apk` compiler.
