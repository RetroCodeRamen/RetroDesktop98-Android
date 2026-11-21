# Lua Studio Phase 4 — Pocket Files, ListView Columns and Editor Quality

> Development branch only (`feature/lua-studio-vb6-phase1`). The released v2.7 APK is unchanged. Source-level tests pass; the features still require Android build verification and physical-device interaction testing.

## Working with files

A Lua app can now save small text files inside its own private workspace directory. Published projects use:

```
C:\Lua Projects\AppData\lua-user-<32 character app ID>\
```

This folder is visible in the built-in Explorer. One Lua program cannot read another program's files through these APIs. A Studio **Run** preview uses a memory-only folder, cleared when the preview closes, so Run can test writes without changing a published app's files.

The file functions deliberately **do not synchronously return file contents**. The isolated LuaJ runtime can't reach Android storage. Instead, `files.read`, `files.write`, `files.list`, and `files.remove` return a request ID; the answer is delivered asynchronously to `Form_FileResult(event)` on the requesting form.

```lua
function Save_Click()
  files.write("notes.txt", ui.get("Notes", "text"))
end

function Load_Click()
  files.read("notes.txt")
end

function Form_FileResult(event)
  if not event.ok then
    ui.message(event.error)
    return
  end
  if event.action == "read" then
    ui.set("Notes", "text", event.text)
  end
end
```

Fields: `event.id` (request ID), `event.ok` (boolean), `event.action` (`read`, `write`, `list`, `remove`), `event.name`, `event.text` (file contents for read, newline-delimited names for list), and `event.error` (failure explanation). As with `Form_DialogResult`, no external network or Android filesystem permissions are given to Lua scripts.

Safety and limits:

- Only **one basename** at a time, matching `^[A-Za-z][A-Za-z0-9_-]{0,31}\.(txt|csv|json)$`; no `/`, `..`, colons or arbitrary extensions.
- At most **32** files per published Lua application, each no larger than **16 KiB of UTF‑8 text**.
- At most **four** file requests per Lua event.
- Write uses a temporary staging file and replaces the destination within the workspace lock.
- File access is controlled by the native host, not by source-generated paths in Lua. Shared workspaces and other Android apps are outside this API.
- Storage is not an encrypted secrets store. Uninstalling the launcher generally deletes its app-local workspace; use Explorer to export files before uninstalling.

Try **Lua Studio → Examples → Pocket Notepad (Files)**; save a note and load it without a file-picker prompt. Published apps retain the note between launches; Studio previews start with a blank temporary folder.

## ListView and TreeView improvements

- `ListView` now has an optional `columns` list, with up to **four** headings. The designer's Properties panel accepts column headings separated by tabs. At runtime use `ui.setColumns("Files1", "Name\tType\tSize")` and `ui.getColumns("Files1")`.
- Each ListView item can use tab-separated cell data. Up to 24 rows, 60 characters per row; single selection still uses `_Change(value)` and returns the complete string.
- `TreeView` paths such as `Projects/Lua Studio` now render as an expandable/collapsible tree instead of simply indenting `<option>` labels. Path selection still fires `_Change(value)` and collapsible branches stay local to that window.
- This is **not** full `MSCOMCTL.OCX` behavior: no image lists, drag/drop nodes, checkboxes, multi-selection, virtual data source, subitem editing, or owner-draw.

## Editor improvements

The Code pane supports soft tabs, indent/outdent of selected lines, and preserving/adding indentation after Enter. It continues to provide the Object/Procedure selectors, find/replace, line numbers, and breakpoints from earlier phases. The compact layout remains usable on 720 × 1520 phones.

## Testing and compatibility

Run:

```sh
node tests/lua-studio-compat.test.js
node tests/lua-studio-phase4.test.js
node tests/dosbox-audio.test.js
```

The project **schema remains version 2**: both v1 migration and older saved v2 projects are still accepted; newly added `columns` properties are optional. The native file bridge must also be checked on Android: the Java and WebView integration isn't proven by Node tests alone.

## Still missing from VB6 parity

Class modules; data-aware controls; Grid/FlexGrid; property pages; component packaging; VB6 COM/ActiveX/OLE; MDI parent/child architecture; standalone Windows EXEs; synchronous blocking common-dialog semantics; full ListView/TreeView collections; GUI resource designer; and a rich watch/immediate expression evaluator. These remain tracked separately and should not be advertised as shipped.
