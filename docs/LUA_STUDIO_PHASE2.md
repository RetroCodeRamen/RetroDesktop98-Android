# Lua Studio Phase 2 — Control Arrays and Modal Forms

> Experimental branch implementation. This is **not** Visual Basic 6 source or binary compatibility. The project format remains `version: 2`; existing Lua Studio v1/v2 projects migrate normally. Android installation and live LuaJ interaction still require testing on a device.

## Control arrays

VB6 lets several controls share one name and identify individual controls with `Index`. Lua Studio keeps **unique internal control names** for workspace compatibility and adds optional `arrayName` and `arrayIndex` properties (0–255) to each instance. Members must share a control type and have unique indexes within a form. An array cannot reuse the name of a concrete control, menu, or `Form`.

**Designer:** Select a control and choose **Create Control Array** from Properties or Edit. Duplicate an array member (Format → Duplicate or Copy/Paste) to get the next unused index. Adjust the **Array name** and **Index** properties in the inspector. The Object selector groups array members under one handler name.

**Runtime event example:** Three buttons `Button1`, `Button2`, `Button3` with `arrayName = "Buttons"`, indexes 0–2, call the same handler:

```lua
function Buttons_Click(index, event)
  ui.set("Result", "text", "You clicked button " .. index)
end
```

The first parameter is the integer index. The second argument is an event table for pointer and keyboard events, or the changed scalar for `Change` events. Timer arrays use a single `index` parameter.

**Indexed API:**

```lua
local title = ui.getAt("Buttons", 0, "text")
ui.setAt("Buttons", 2, "text", "Ready")
-- Optional final argument selects another form.
ui.setAt("Buttons", 1, "enabled", false, "MainForm")
```

The existing `ui.get("Button1", "text")` and `ui.set("Button1", "text", "Hello")` continue to work. Control arrays are **static** in this phase; VB6's dynamic `Load`/`Unload` member creation isn't implemented.

## Modal forms

Call `ui.showModal("SettingsForm")` from an event to open the named form. All other forms **in the same Lua project session** stop accepting input while that form is visible. Modal forms can be nested; the topmost modal is the only form receiving input. Close it with `ui.hide()` to preserve its state, `ui.unload()` to reset its state, or the window close button. Background forms become interactive again when the top modal closes.

```lua
-- MainForm
function OpenDialog_Click()
  ui.showModal("SettingsForm")
end

-- SettingsForm
function Done_Click()
  ui.hide()
end
```

**Important distinction from VB6 `Show vbModal`:** Lua Studio handles events asynchronously. `ui.showModal()` **does not block Lua code** or return the user's selection. Any results should be saved in `shared` or communicated through `ui.set` to another form and used in a later event. Modal behavior is limited to other windows in the same Lua program; it does not disable Android apps or the main launcher.

## Built-in examples

- **Examples → Control Arrays:** Three buttons share `Buttons_Click(index, event)`; tapping a button updates a label.
- **Examples → Modal Dialog:** `Open Settings` shows a second form that prevents interaction with the first until **OK** or close.

## Validation and compatibility

- Projects reject malformed array names, duplicate indexes, mixed control types, and indexes outside 0–255.
- Existing single-control event handlers and non-array `ui.get`/`ui.set` semantics are preserved.
- The preview blocks events from background forms while modal, and its native LuaJ service has a second guard against receiving those events.
- Source tests cover examples, migration, indexes, dispatch/argument signatures, and simulated modal interaction.
- Java source and Android debug APK must still be compiled by GitHub Actions, and real-device tests should cover tap/keyboard input, modal dismissal, saving, and execution of indexed setters.

## Next tasks

Common Dialog, `MsgBox`/`InputBox` (asynchronous), `Form_QueryUnload`, `Form_Resize`, dynamic array members, more intrinsic and common controls, and permission-bounded file access. MDI parent/child is separate from modal window handling.
