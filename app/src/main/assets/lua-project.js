"use strict";

const luaProjectFormat = "Retro Desktop 98 Lua Studio";
const luaMaxCode = 60000;
const luaMaxPayload = 220000;
const luaIdentifier = /^[a-z][a-z0-9_]{0,31}$/i;
const luaControlTypes = {
  label: {caption: "Label", prefix: "Label", width: 95, height: 25},
  button: {caption: "CommandButton", prefix: "Command", width: 105, height: 32, event: "Click"},
  text: {caption: "TextBox", prefix: "Text", width: 135, height: 29, event: "Change"},
  multiline: {caption: "Multiline TextBox", prefix: "Memo", width: 148, height: 72, event: "Change"},
  check: {caption: "CheckBox", prefix: "Check", width: 107, height: 26, event: "Change"},
  option: {caption: "OptionButton", prefix: "Option", width: 107, height: 26, event: "Change"},
  combo: {caption: "ComboBox", prefix: "Combo", width: 112, height: 30, event: "Change"},
  list: {caption: "ListBox", prefix: "List", width: 112, height: 82, event: "Change"},
  frame: {caption: "Frame", prefix: "Frame", width: 145, height: 88},
  hscroll: {caption: "HScrollBar", prefix: "HScroll", width: 120, height: 24, event: "Change"},
  vscroll: {caption: "VScrollBar", prefix: "VScroll", width: 28, height: 94, event: "Change"},
  progress: {caption: "ProgressBar", prefix: "Progress", width: 120, height: 24},
  timer: {caption: "Timer", prefix: "Timer", width: 70, height: 26, event: "Timer"},
  shape: {caption: "Shape", prefix: "Shape", width: 74, height: 48},
  line: {caption: "Line", prefix: "Line", width: 85, height: 20},
  image: {caption: "Image", prefix: "Image", width: 112, height: 72},
  picture: {caption: "PictureBox", prefix: "Picture", width: 128, height: 80},
  treeview: {caption: "TreeView", prefix: "Tree", width: 164, height: 118, event: "Change"},
  listview: {caption: "ListView", prefix: "ListView", width: 164, height: 110, event: "Change"},
  tabstrip: {caption: "TabStrip", prefix: "TabStrip", width: 180, height: 35, event: "Change"},
  toolbar: {caption: "Toolbar", prefix: "Toolbar", width: 196, height: 34, event: "Change"},
  statusbar: {caption: "StatusBar", prefix: "StatusBar", width: 200, height: 27}
};
const luaRangeTypes = ["hscroll", "vscroll", "progress"];
const luaChoiceTypes = ["list", "combo", "treeview", "listview", "tabstrip", "toolbar"];
const luaImageTypes = ["image", "picture"];
const luaTickTypes = ["check", "option"];
const luaTextTypes = ["text", "multiline"];

// VB6's Object and Procedure dropdowns are separate. Events remain Lua handlers.
// The first event for each control is its default double-click designer action.
const luaFormEvents = ["Load", "Activate", "Unload", "Click", "DblClick", "MouseDown", "MouseUp", "KeyDown", "KeyUp", "DialogResult", "FileResult"];
const luaPointerEvents = ["Click", "DblClick", "MouseDown", "MouseUp"];
const luaFocusEvents = ["GotFocus", "LostFocus", "KeyDown", "KeyUp"];
function luaEventsForType(type) {
  if (type === "timer") return ["Timer"];
  if (type === "statusbar") return luaPointerEvents;
  if (type === "button") return ["Click", "DblClick", ...luaFocusEvents, "MouseDown", "MouseUp"];
  if (luaTextTypes.includes(type) || luaChoiceTypes.includes(type) || luaTickTypes.includes(type) ||
      type === "hscroll" || type === "vscroll") {
    return ["Change", ...luaPointerEvents, ...luaFocusEvents];
  }
  if (type === "label" || type === "image" || type === "picture" || type === "frame") return luaPointerEvents;
  return [];
}


function luaWhole(value, minimum, maximum, fallback = minimum) {
  return Number.isFinite(value) ? clamp(Math.round(value), minimum, maximum) : fallback;
}

function luaText(value, maximum, fallback = "") {
  return typeof value === "string" ? value.slice(0, maximum) : fallback;
}

function luaColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function luaControl(type, name, text, x, y, width, height) {
  return {type, name, text, x, y, width, height, arrayName: "", arrayIndex: 0,
    visible: true, enabled: type !== "timer",
    checked: false, value: luaRangeTypes.includes(type) ? 0 : "", items: [], columns: [],
    group: "Group1", tabStop: true, tabIndex: 0, min: 0, max: 100, interval: 1000, color: "#000080", shape: "rectangle", image: ""};
}

function luaNewForm(name) {
  return {name, caption: name, width: 300, height: 175, color: "#d4d0c8", left: 0, top: 0, position: "automatic", controls: [], menus: [],
    code: "-- Add a control and open its event from Properties.\n"};
}

function luaFreeName(prefix, names) {
  let index = 1;
  const taken = new Set(names);
  while (taken.has(prefix + index)) index++;
  return prefix + index;
}

function luaMenuCommands(form) {
  return form.menus.flatMap(menu => menu.items?.length ? menu.items : [menu]);
}

function luaProject(value) {
  if (value?.format !== luaProjectFormat || typeof value.name !== "string") {
    throw Error("Choose a Lua Studio project file.");
  }
  if (value.version === 1 && value.form) {
    value = {...value, version: 2, startup: "Form1", modules: [],
      forms: [{...value.form, name: "Form1", controls: value.controls, code: value.code, menus: []}]};
  }
  if (value.version !== 2 || !Array.isArray(value.forms) || !value.forms.length || value.forms.length > 8 ||
      !Array.isArray(value.modules) || value.modules.length > 12) throw Error("This project format is unsupported.");
  const objectNames = new Set();
  const useName = (raw, names) => {
    if (typeof raw !== "string" || !luaIdentifier.test(raw) || names.has(raw)) {
      throw Error("An object has an invalid or duplicate name.");
    }
    names.add(raw);
    return raw;
  };
  const source = raw => {
    if (typeof raw !== "string" || raw.length > luaMaxCode) throw Error("A Lua file exceeds the source limit.");
    return raw;
  };
  const forms = value.forms.map(raw => {
    const name = useName(raw?.name, objectNames);
    const form = {name, caption: luaText(raw.caption, 80, name) || name,
      width: luaWhole(raw.width, 160, 720, 300), height: luaWhole(raw.height, 108, 640, 175),
      color: luaColor(raw.color, "#d4d0c8"), code: source(raw.code), left: luaWhole(raw.left, 0, 2000, 0),
      top: luaWhole(raw.top, 0, 2000, 0), position: raw.position === "manual" ? "manual" : "automatic"};
    if (!Array.isArray(raw.controls) || raw.controls.length > 48 || !Array.isArray(raw.menus) ||
        raw.menus.length > 10) throw Error("The form has too many controls or menus.");
    const names = new Set();
    const groups = new Map();
    form.controls = raw.controls.map(control => {
      if (!control || !Object.prototype.hasOwnProperty.call(luaControlTypes, control.type)) {
        throw Error("A form contains an unknown control.");
      }
      const id = useName(control.name, names);
      const arrayName = control.arrayName == null || control.arrayName === "" ? "" : control.arrayName;
      if (arrayName && (typeof arrayName !== "string" || !luaIdentifier.test(arrayName) || arrayName === "Form")) {
        throw Error("A control array has an invalid name.");
      }
      const arrayIndex = arrayName ? control.arrayIndex : 0;
      if (arrayName && (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > 255)) {
        throw Error("Control array indexes must be integers from 0 to 255.");
      }
      if (arrayName) {
        const group = groups.get(arrayName) || {type: control.type, used: new Set()};
        if (group.type !== control.type || group.used.has(arrayIndex)) {
          throw Error("Array members need the same control type and distinct indexes.");
        }
        group.used.add(arrayIndex);
        groups.set(arrayName, group);
      }
      const width = luaWhole(control.width, 20, form.width);
      const height = luaWhole(control.height, 18, form.height);
      const items = Array.isArray(control.items) ?
        [...new Set(control.items.slice(0, 24).map(item => luaText(item, 60)).filter(Boolean))] : [];
      const columns = control.type === "listview" && Array.isArray(control.columns) ?
        control.columns.slice(0, 4).map(label => luaText(label, 24).trim()).filter(Boolean) : [];
      const min = luaWhole(control.min, -10000, 9999, 0);
      const max = luaWhole(control.max, min + 1, 10000, Math.max(min + 1, 100));
      const image = luaText(control.image, 85001);
      return {...luaControl(control.type, id, luaText(control.text, 500),
        luaWhole(control.x, 0, form.width - width), luaWhole(control.y, 0, form.height - height), width, height),
        arrayName, arrayIndex, items, columns, checked: control.checked === true, enabled: control.enabled !== false, visible: control.visible !== false,
        group: luaText(control.group, 32, "Group1") || "Group1", min, max, tabStop: control.tabStop !== false,
        tabIndex: luaWhole(control.tabIndex, 0, 99, 0),
        value: luaRangeTypes.includes(control.type) ? luaWhole(control.value, min, max, min) :
          items.includes(control.value) ? control.value : "",
        interval: luaWhole(control.interval, 100, 60000, 1000), color: luaColor(control.color, "#000080"),
        shape: ["rectangle", "ellipse"].includes(control.shape) ? control.shape : "rectangle",
        image: image.length <= 85000 && /^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(image) ? image : ""};
    });
    const makeMenu = item => ({name: useName(item?.name, names),
      caption: luaText(item.caption, 65, item.name) || item.name, enabled: item.enabled !== false});
    form.menus = raw.menus.map(menu => {
      const entry = makeMenu(menu);
      if (!Array.isArray(menu.items) || menu.items.length > 14) throw Error("A menu has too many items.");
      return {...entry, items: menu.items.map(makeMenu)};
    });
    // A shared handler name cannot shadow a concrete control or a menu handler.
    for (const group of groups.keys()) {
      if (names.has(group)) throw Error("A control array name conflicts with a control or menu.");
    }
    return form;
  });
  const modules = value.modules.map(raw => ({name: useName(raw?.name, objectNames), code: source(raw.code),
    kind: raw.kind === "class" ? "class" : "module"}));
  const meta = value.meta && typeof value.meta === "object" && !Array.isArray(value.meta) ? value.meta : {};
  const version = luaText(meta.version, 24, "1.0.0");
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)) throw Error("Use a version like 1.0.0.");
  const description = luaText(meta.description, 160);
  const valid = {format: luaProjectFormat, version: 2, name: luaText(value.name, 70).trim() || "Project1",
    startup: forms.some(form => form.name === value.startup) ? value.startup : forms[0].name,
    forms, modules, meta: {version, description}};
  if (JSON.stringify(valid).length > luaMaxPayload) throw Error("This Lua project is too large.");
  return valid;
}

function luaTwoFormExample() {
  const main = luaNewForm("MainForm");
  const settings = luaNewForm("SettingsForm");
  main.caption = "Two-Form Project";
  main.controls.push(luaControl("label", "Label1", "Open settings from File", 14, 30, 272, 33));
  main.menus.push({name: "FileMenu", caption: "File", enabled: true,
    items: [{name: "OptionsMenu", caption: "Settings…", enabled: true}]});
  main.code = 'function OptionsMenu_Click()\n  ui.show("SettingsForm")\nend\n';
  settings.caption = "Settings";
  settings.controls.push(luaControl("button", "Apply", "Apply", 16, 44, 115, 32));
  settings.code = 'function Apply_Click()\n  ui.set("Label1", "text", labelText("Settings applied"), "MainForm")\n  ui.hide()\nend\n';
  return {format: luaProjectFormat, version: 2, name: "Two-Form Project", startup: "MainForm",
    forms: [main, settings], modules: [{name: "Module1",
      code: 'function labelText(message)\n  return "Status: " .. message\nend\n'}]};
}

// The control name remains a stable per-instance identifier. An optional arrayName
// groups same-type controls for VB6-style shared event procedures, with arrayIndex.
function luaArrayMembers(form, name) {
  return form.controls.filter(control => control.arrayName === name)
    .slice().sort((a, b) => a.arrayIndex - b.arrayIndex);
}

function luaArrayNextIndex(form, arrayName) {
  const used = new Set(luaArrayMembers(form, arrayName).map(control => control.arrayIndex));
  for (let index = 0; index <= 255; index++) if (!used.has(index)) return index;
  throw Error("This array is full.");
}

function luaHandlerSignature(control, event) {
  const tail = event === "Change" ? "value" :
    ["Click", "DblClick", "MouseDown", "MouseUp", "KeyDown", "KeyUp"].includes(event) ? "event" : "";
  return (control?.arrayName ? "index" + (tail ? ", " + tail : "") : tail);
}

function luaControlArrayExample() {
  const form = luaNewForm("MainForm");
  form.caption = "Control Arrays";
  form.height = 224;
  for (let index = 0; index < 3; index++) {
    const control = luaControl("button", "Button" + (index + 1), "Button " + (index + 1),
      14, 15 + index * 54, 124, 38);
    control.arrayName = "Buttons";
    control.arrayIndex = index;
    form.controls.push(control);
  }
  form.controls.push(luaControl("label", "Result", "Tap a button", 150, 54, 130, 48));
  form.code = 'function Buttons_Click(index, event)\n  ui.set("Result", "text", "Button index: " .. index)\nend\n';
  return {format: luaProjectFormat, version: 2, name: "Control Arrays", startup: "MainForm",
    forms: [form], modules: []};
}

function luaModalExample() {
  const main = luaNewForm("MainForm");
  main.caption = "Modal Dialog Demo";
  main.controls.push(luaControl("button", "OpenDialog", "Open Settings", 25, 33, 160, 34));
  main.code = 'function OpenDialog_Click()\n  ui.showModal("SettingsForm")\nend\n';
  const dialog = luaNewForm("SettingsForm");
  dialog.caption = "Settings (Modal)";
  dialog.controls.push(luaControl("label", "Info", "Main window is disabled until you close this one.", 12, 14, 266, 61));
  dialog.controls.push(luaControl("button", "Done", "OK", 95, 98, 110, 33));
  dialog.code = 'function Done_Click()\n  ui.hide()\nend\n';
  return {format: luaProjectFormat, version: 2, name: "Modal Dialog", startup: "MainForm",
    forms: [main, dialog], modules: []};
}


// Sample built entirely with the existing v2 project format. No migration is
// needed when a user opens a saved project from earlier releases.
function luaCommonControlsExample() {
  const form = luaNewForm("MainForm");
  form.caption = "Common Controls";
  form.width = 355;
  form.height = 330;
  const tree = luaControl("treeview", "Tree1", "Folders", 10, 12, 163, 145);
  tree.items = ["Projects", "Projects/Lua Studio", "Projects/DOSBox", "Documents", "Documents/Notes"];
  tree.value = tree.items[0];
  const list = luaControl("listview", "Files1", "Files", 183, 12, 158, 145);
  list.items = ["README.md", "main.lua", "settings.json"];
  list.value = list.items[0];
  const tabs = luaControl("tabstrip", "Tabs1", "Tabs", 10, 172, 330, 38);
  tabs.items = ["General", "Advanced", "About"];
  tabs.value = tabs.items[0];
  const toolbar = luaControl("toolbar", "Actions1", "Actions", 10, 223, 330, 38);
  toolbar.items = ["New", "Open", "Save"];
  toolbar.value = toolbar.items[0];
  const status = luaControl("statusbar", "Status1", "Ready", 10, 280, 330, 26);
  form.controls.push(tree, list, tabs, toolbar, status);
  form.code = 'function Tree1_Change(value)\n  ui.set("Status1", "text", "Folder: " .. value)\nend\n\n' +
    'function Files1_Change(value)\n  ui.set("Status1", "text", "File: " .. value)\nend\n\n' +
    'function Tabs1_Change(value)\n  ui.set("Status1", "text", "Tab: " .. value)\nend\n\n' +
    'function Actions1_Change(value)\n  ui.set("Status1", "text", "Toolbar: " .. value)\nend\n';
  return {format: luaProjectFormat, version: 2, name: "Common Controls", startup: "MainForm",
    forms: [form], modules: []};
}

function luaDialogsExample() {
  const form = luaNewForm("MainForm");
  form.caption = "Common Dialogs";
  form.height = 240;
  form.controls.push(luaControl("button", "Ask1", "Input Box", 12, 14, 131, 34));
  form.controls.push(luaControl("button", "Confirm1", "Confirm", 153, 14, 130, 34));
  form.controls.push(luaControl("button", "Color1", "Choose Color", 12, 63, 131, 34));
  form.controls.push(luaControl("button", "Alert1", "Message Box", 153, 63, 130, 34));
  form.controls.push(luaControl("label", "Result1", "Awaiting response", 12, 125, 269, 80));
  form.code = 'function Ask1_Click()\n  ui.dialog("input", "Your Name", "What should I call you?", "Ada")\nend\n\n' +
    'function Confirm1_Click()\n  ui.dialog("confirm", "Confirm Action", "Save the changes?")\nend\n\n' +
    'function Color1_Click()\n  ui.dialog("color", "Pick a Color", "Choose a background color", "#008080")\nend\n\n' +
    'function Alert1_Click()\n  ui.dialog("message", "Hello", "This is a Windows 98-style dialog.")\nend\n\n' +
    'function Form_DialogResult(event)\n  if event.accepted then\n    ui.set("Result1", "text", event.kind .. ": " .. event.value)\n  else\n    ui.set("Result1", "text", "Canceled: " .. event.kind)\n  end\nend\n';
  return {format: luaProjectFormat, version: 2, name: "Common Dialogs", startup: "MainForm",
    forms: [form], modules: []};
}

// The same API works in a Studio preview (temporary files) or a published
// app (its private folder under C:\\Lua Projects\\AppData).
function luaFilesExample() {
  const form = luaNewForm("MainForm");
  form.caption = "Pocket Notepad"; form.width = 355; form.height = 255;
  form.controls.push(luaControl("multiline", "Memo1", "", 12, 14, 326, 143));
  form.controls.push(luaControl("button", "Save1", "Save Note", 12, 172, 144, 32));
  form.controls.push(luaControl("button", "Load1", "Load Note", 178, 172, 153, 32));
  form.controls.push(luaControl("statusbar", "Status1", "Ready", 12, 216, 326, 26));
  form.code = `function Save1_Click()
  files.write("note.txt", ui.get("Memo1", "text"))
end

function Load1_Click()
  files.read("note.txt")
end

function Form_FileResult(event)
  if not event.ok then
    ui.set("Status1", "text", event.error)
    return
  end
  if event.action == "read" then ui.set("Memo1", "text", event.text) end
  ui.set("Status1", "text", event.action .. " complete")
end
`;
  return {format: luaProjectFormat, version: 2, name: "Pocket Notepad", startup: "MainForm", forms: [form], modules: []};
}

// Plain Lua factory, not COM/ActiveX. Modules run in the isolated LuaJ environment;
// this pattern gives reusable stateful objects without exposing metatables or Java.
function luaClassTemplate(name) {
  return `-- ${name}: reusable class-style factory\n-- Call ${name}_new() from any form.\nfunction ${name}_new(initial)\n  local value = tonumber(initial) or 0\n  local obj = {}\n  function obj:getValue()\n    return value\n  end\n  function obj:increment(amount)\n    value = value + (tonumber(amount) or 1)\n    return value\n  end\n  return obj\nend\n`;
}

function luaClassExample() {
  const main = luaNewForm("MainForm");
  main.caption = "Counter Object Demo";
  main.controls.push(luaControl("button", "Advance", "Add 1", 30, 24, 100, 32));
  main.controls.push(luaControl("label", "Result", "0", 30, 72, 160, 32));
  main.code = `function Form_Load()
  shared.counter = Counter_new(0)
end

function Advance_Click()
  ui.set("Result", "text", tostring(shared.counter:increment(1)))
end
`;
  return {format: luaProjectFormat, version: 2, name: "Reusable Class Demo", startup: "MainForm", forms: [main],
    modules: [{name:"Counter", kind:"class", code:luaClassTemplate("Counter")}]};
}
