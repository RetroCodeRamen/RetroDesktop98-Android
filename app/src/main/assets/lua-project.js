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
  picture: {caption: "PictureBox", prefix: "Picture", width: 128, height: 80}
};
const luaRangeTypes = ["hscroll", "vscroll", "progress"];
const luaChoiceTypes = ["list", "combo"];
const luaImageTypes = ["image", "picture"];
const luaTickTypes = ["check", "option"];
const luaTextTypes = ["text", "multiline"];

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
  return {type, name, text, x, y, width, height, visible: true, enabled: type !== "timer",
    checked: false, value: luaRangeTypes.includes(type) ? 0 : "", items: [],
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
    form.controls = raw.controls.map(control => {
      if (!control || !Object.prototype.hasOwnProperty.call(luaControlTypes, control.type)) {
        throw Error("A form contains an unknown control.");
      }
      const id = useName(control.name, names);
      const width = luaWhole(control.width, 20, form.width);
      const height = luaWhole(control.height, 18, form.height);
      const items = Array.isArray(control.items) ?
        [...new Set(control.items.slice(0, 24).map(item => luaText(item, 60)).filter(Boolean))] : [];
      const min = luaWhole(control.min, -10000, 9999, 0);
      const max = luaWhole(control.max, min + 1, 10000, Math.max(min + 1, 100));
      const image = luaText(control.image, 85001);
      return {...luaControl(control.type, id, luaText(control.text, 500),
        luaWhole(control.x, 0, form.width - width), luaWhole(control.y, 0, form.height - height), width, height),
        items, checked: control.checked === true, enabled: control.enabled !== false, visible: control.visible !== false,
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
    return form;
  });
  const modules = value.modules.map(raw => ({name: useName(raw?.name, objectNames), code: source(raw.code)}));
  const valid = {format: luaProjectFormat, version: 2, name: luaText(value.name, 70).trim() || "Project1",
    startup: forms.some(form => form.name === value.startup) ? value.startup : forms[0].name,
    forms, modules};
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
