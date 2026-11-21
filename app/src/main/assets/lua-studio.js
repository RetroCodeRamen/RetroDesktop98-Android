"use strict";

function luaExample(example = "counter") {
  const base = {
    format: luaProjectFormat, version: 1, name: "Project1",
    form: {caption: "Form1", width: 300, height: 175},
    controls: [], code: "-- Add a control and open its event from Properties.\n"
  };
  if (example === "counter") {
    return {...base, name: "Click Counter", form: {...base.form, caption: "Click Counter"},
      controls: [
        luaControl("label", "Label1", "Clicks: 0", 24, 24, 245, 29),
        luaControl("button", "Command1", "Add one", 24, 75, 120, 32),
        luaControl("button", "Command2", "Reset", 160, 75, 116, 32)
      ],
      code: 'local count = 0\n\nfunction Command1_Click()\n  count = count + 1\n  ui.set("Label1", "Clicks: " .. count)\n  print("Count", count)\nend\n\nfunction Command2_Click()\n  count = 0\n  ui.set("Label1", "Clicks: 0")\nend\n'
    };
  }
  if (example === "events") {
    return {...base, name: "Event Playground", form: {...base.form, caption: "Event Playground", height: 210},
      controls: [
        luaControl("label", "Label1", "Try typing, clicking and double-clicking", 12, 12, 275, 27),
        luaControl("text", "Text1", "", 12, 47, 265, 29),
        luaControl("button", "Command1", "Try me", 12, 94, 125, 36),
        luaControl("label", "Label2", "Watch Immediate output", 12, 151, 270, 30)
      ],
      code: 'function Command1_Click()\n  ui.set("Label2", "Single click")\n  print("Button clicked")\nend\n\n' +
        'function Command1_DblClick(event)\n  print("Double click at", event.x, event.y)\nend\n\n' +
        'function Command1_MouseDown(event)\n  print("Pointer button", event.button)\nend\n\n' +
        'function Text1_Change(value)\n  print("Text changed to", value)\nend\n\n' +
        'function Text1_KeyDown(event)\n  print("Key", event.key)\nend\n'
    };
  }
  if (example === "greeter") {
    return {...base, name: "Hello Form", form: {...base.form, caption: "Hello Form", height: 188},
      controls: [
        luaControl("label", "Label1", "Enter your name", 20, 16, 244, 25),
        luaControl("text", "Text1", "", 20, 49, 200, 30),
        luaControl("button", "Command1", "Say hello", 20, 94, 112, 32),
        luaControl("label", "Label2", "", 20, 138, 254, 28)
      ],
      code: 'function Command1_Click()\n  local name = ui.get("Text1")\n  if name == "" then name = "friend" end\n  ui.set("Label2", "Hello, " .. name .. "!")\nend\n'
    };
  }
  return base;
}

function loadLuaProject() {
  try {
    return luaProject(JSON.parse(native?.loadLuaProject?.() || localStorage.getItem("retro98-lua-project") || "null"));
  } catch (error) {
    return luaProject(luaExample());
  }
}

// One renderer shared by the form designer and running windows. It never
// interpolates the user's items as HTML; labels are plain text.
function luaCommonControlItems(control, node) {
  if (!["treeview", "listview", "tabstrip", "toolbar"].includes(control.type)) return;
  const items = control.items || [];
  if (control.type === "treeview" || control.type === "listview") {
    const signature = JSON.stringify(items);
    if (node.dataset.items !== signature) {
      node.replaceChildren();
      for (const item of items) {
        const depth = control.type === "treeview" ? Math.min(4, item.split("/").length - 1) : 0;
        const caption = ("  ".repeat(depth)) + (control.type === "treeview" ? item.split("/").at(-1) : item);
        node.add(new Option(caption, item));
      }
      node.dataset.items = signature;
    }
    if (node.value !== control.value) node.value = control.value;
    return;
  }
  const signature = JSON.stringify([items, control.value]);
  if (node.dataset.items !== signature) {
    node.replaceChildren();
    for (const item of items) {
      const tab = element("button", "bevel lua-common-item", item);
      tab.type = "button";
      tab.disabled = !control.enabled;
      tab.dataset.value = item;
      tab.setAttribute("aria-pressed", String(item === control.value));
      tab.addEventListener("click", () => {
        if (node.value === item) return;
        node.value = item;
        node.dispatchEvent(new Event("change", {bubbles: true}));
      });
      node.append(tab);
    }
    node.dataset.items = signature;
  }
  node.value = control.value;
}

function luaObjectNode(control) {
  let node;
  let text;
  if (control.type === "button") {
    node = text = element("button", "bevel lua-command");
    node.type = "button";
  } else if (luaTextTypes.includes(control.type)) {
    node = element(control.type === "multiline" ? "textarea" : "input", "text-entry lua-input");
    if (control.type === "text") node.type = "text";
    node.maxLength = 500;
    node.setAttribute("aria-label", control.name);
  } else if (luaTickTypes.includes(control.type)) {
    node = element("label", "lua-check");
    const check = element("input");
    check.type = control.type === "check" ? "checkbox" : "radio";
    text = element("span");
    node.append(check, text);
  } else if (luaChoiceTypes.includes(control.type)) {
    if (["tabstrip", "toolbar"].includes(control.type)) {
      node = element("div", "lua-common-strip lua-" + control.type);
      node.setAttribute("role", "group");
    } else {
      node = element("select", "text-entry lua-list-control lua-" + control.type);
      node.size = ["list", "treeview", "listview"].includes(control.type) ? 4 : 1;
      if (["list", "combo"].includes(control.type)) {
        node.add(new Option("", ""));
        control.items.forEach(item => node.add(new Option(item, item)));
      }
    }
    node.setAttribute("aria-label", control.name);
    luaCommonControlItems(control, node);
  } else if (luaRangeTypes.includes(control.type)) {
    node = element(control.type === "progress" ? "progress" : "input", "lua-range lua-" + control.type);
    if (control.type !== "progress") node.type = "range";
    node.setAttribute("aria-label", control.name);
  } else if (luaImageTypes.includes(control.type)) {
    node = element("div", "lua-picture lua-" + control.type);
    if (control.image) {
      const image = element("img");
      image.src = control.image;
      image.alt = "";
      node.append(image);
    }
  } else if (["shape", "line", "timer"].includes(control.type)) {
    node = element("div", "lua-" + control.type);
    if (control.type === "timer") node.append(retroIcon("clock", 17), element("span", "", control.name));
    if (control.type !== "timer") node.style.setProperty("--draw-color", control.color);
    if (control.type === "shape" && control.shape === "ellipse") node.classList.add("lua-ellipse");
  } else if (control.type === "statusbar") {
    node = text = element("div", "lua-statusbar-control");
  } else if (control.type === "frame") {
    node = element("fieldset", "lua-group");
    text = element("legend");
    node.append(text);
  } else {
    node = text = element("div", "lua-label");
  }
  const input = luaTickTypes.includes(control.type) ? node.querySelector("input")
    : luaInputProperty(control) ? node : null;
  return {node, text, input};
}

function luaInputProperty(control) {
  if (luaTickTypes.includes(control.type)) return "checked";
  if (luaTextTypes.includes(control.type)) return "text";
  if ([...luaChoiceTypes, "hscroll", "vscroll"].includes(control.type)) return "value";
  return "";
}

function updateLuaObject(control, parts, design) {
  const {node, text, input} = parts;
  if (text) text.textContent = control.text;
  luaCommonControlItems(control, node);
  if (input) {
    if (luaTickTypes.includes(control.type)) input.checked = control.checked;
    else {
      if (luaRangeTypes.includes(control.type)) {
        input.min = control.min;
        input.max = control.max;
      }
      const value = luaTextTypes.includes(control.type) ? control.text : String(control.value);
      if (input.value !== value) input.value = value;
    }
    input.disabled = !control.enabled;
  }
  if (control.type === "progress") {
    node.max = control.max - control.min;
    node.value = control.value - control.min;
  }
  if (control.type === "button") node.disabled = !control.enabled;
  node.classList.toggle("lua-hidden-design", design && !control.visible);
  node.classList.toggle("lua-disabled-design", design && !control.enabled);
  node.hidden = !design && !control.visible;
}

function renderLuaStudio(win) {
  let project = loadLuaProject();
  let publishedId = native?.loadLuaWorkspaceProgram?.() || "";
  if (!isLuaProgramId(publishedId)) publishedId = "";
  let form = project.forms.find(entry => entry.name === project.startup);
  let module = null;
  let selected = "";
  let selectedControls = new Set();
  let multiSelect = false;
  let snapToGrid = true;
  let runtime = null;
  let pictureTarget = null;
  const breakpoints = new Map();
  let watches = [];
  const designerClipboard = [];
  const history = [];
  let historyIndex = -1;
  let historyAt = 0;
  const sourceDoc = () => module || form;
  const sourceName = () => sourceDoc().name + ".lua";
  let method = "Form_Load";
  let caretOffset = 0;
  let tool = "";
  let backup = JSON.stringify(project);
  let saveTimer = 0;
  let fileRequest = "";
  const logs = [];
  let pane = "design";

  const shell = element("div", "lua-shell");
  const chrome = element("div", "lua-chrome");
  const menuBar = element("div", "window-menubar lua-menubar");
  const toolbar = element("div", "app-toolbar lua-toolbar");
  const tabs = element("div", "lua-tabs");
  const designer = element("div", "lua-designer");
  const explorer = element("div", "lua-project-explorer sunken");
  const menuEditor = element("div", "lua-menu-editor sunken");
  const debugPanel = element("div", "lua-debug-panel sunken");
  debugPanel.hidden = true;
  const codeCaption = element("span", "lua-source-name");
  const toolbox = element("div", "lua-toolbox sunken");
  const stage = element("div", "lua-stage");
  const viewport = element("div", "lua-stage-viewport");
  const spacer = element("div", "lua-stage-spacer");
  const paper = element("div", "lua-paper");
  const title = element("div", "lua-paper-title");
  const artboard = element("div", "lua-artboard");
  const inspector = element("div", "lua-inspector sunken");
  const editor = element("div", "lua-editor");
  const code = element("textarea", "lua-code-input");
  const gutters = element("pre", "lua-gutters", "1");
  const actions = element("div", "app-toolbar lua-code-actions");
  const objects = element("select", "text-entry");
  objects.setAttribute("aria-label", "Object (VB6-style selector)");
  const eventKinds = element("select", "text-entry");
  eventKinds.setAttribute("aria-label", "Procedure or event (VB6-style selector)");
  const immediate = element("pre", "lua-immediate");
  immediate.setAttribute("aria-label", "Immediate output");
  immediate.setAttribute("role", "log");
  const status = appStatus("Ready");
  const tools = new Map();
  const tabButtons = new Map();

  function textStatus(message) {
    status.textContent = message;
  }

  function persist() {
    clearTimeout(saveTimer);
    const json = JSON.stringify(project);
    if (json.length > luaMaxPayload) {
      textStatus("The project exceeds the size limit.");
      return;
    }
    if (native?.saveLuaWorkspace) native.saveLuaWorkspace(json, publishedId);
    else if (native?.saveLuaProject) native.saveLuaProject(json);
    else localStorage.setItem("retro98-lua-project", json);
  }

  // Project-wide undo includes designer, properties, menus and code. Consecutive keystrokes
  // in the same Lua file are coalesced so the 80-entry history is useful on a phone.
  function recordHistory(kind = "design") {
    const snapshot = JSON.stringify(project);
    if (history[historyIndex]?.snapshot === snapshot) return;
    const now = Date.now();
    if (kind === "typing" && historyIndex > 0 && history[historyIndex]?.kind === "typing" &&
        history[historyIndex]?.source === sourceName() && now - historyAt < 900) {
      history[historyIndex] = {snapshot, kind, source: sourceName()};
    } else {
      history.splice(historyIndex + 1);
      history.push({snapshot, kind, source: sourceName()});
      if (history.length > 80) history.shift();
      historyIndex = history.length - 1;
    }
    historyAt = now;
  }

  function resetHistory() {
    history.length = 0;
    historyIndex = -1;
    recordHistory();
  }

  function travelHistory(direction) {
    const next = historyIndex + direction;
    if (next < 0 || next >= history.length) {
      textStatus(direction < 0 ? "Nothing to undo." : "Nothing to redo.");
      return;
    }
    const priorForm = form.name;
    const priorModule = module?.name;
    const view = pane;
    project = luaProject(JSON.parse(history[next].snapshot));
    historyIndex = next;
    historyAt = 0;
    form = project.forms.find(item => item.name === priorForm) || project.forms[0];
    module = project.modules.find(item => item.name === priorModule) || null;
    selected = "";
    selectedControls.clear();
    method = "Form_Load";
    syncSource();
    redrawDesign();
    setPane(module ? "code" : view);
    persist();
    textStatus(direction < 0 ? "Undo complete." : "Redo complete.");
  }

  function modified(kind = "design") {
    recordHistory(kind);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 280);
  }

  function codeChanged() {
    caretOffset = code.selectionStart;
    const document = sourceDoc();
    const before = document.code;
    document.code = code.value;
    const marks = breakpoints.get(document.name);
    if (marks && before.split("\n").length !== code.value.split("\n").length) {
      // Breakpoints stay attached to source lines. Clear line numbers that may now refer to other statements.
      breakpoints.delete(document.name);
      textStatus("Line positions changed. Set the affected breakpoints again.");
    }
    updateGutters();
    modified("typing");
  }

  function updateGutters() {
    const marks = breakpoints.get(sourceDoc().name);
    gutters.textContent = Array.from({length: code.value.split("\n").length}, (_, index) =>
      (marks?.has(index + 1) ? "● " : "  ") + (index + 1)).join("\n");
    gutters.scrollTop = code.scrollTop;
  }

  function codeLineHeight() {
    return parseFloat(getComputedStyle(code).lineHeight);
  }

  function scrollToCodeLine(line) {
    code.scrollTop = Math.max(0, (line - 4) * codeLineHeight());
    gutters.scrollTop = code.scrollTop;
  }

  function applyDensity() {
    const compact = state.luaDensity === "compact" || (state.luaDensity === "auto" &&
      ((shell.clientWidth > 0 && shell.clientWidth <= 520) || (shell.clientHeight > 0 && shell.clientHeight <= 360)));
    const density = compact ? "compact" : "standard";
    if (shell.dataset.density === density) return;
    const topLine = code.scrollTop / codeLineHeight();
    shell.dataset.density = density;
    if (pane === "code") {
      code.scrollTop = topLine * codeLineHeight();
      gutters.scrollTop = code.scrollTop;
    }
    if (pane === "design") layoutStage();
  }

  function chooseDensity(value, label) {
    state.luaDensity = value;
    saveState();
    applyDensity();
    textStatus(label);
  }

  function setPane(value) {
    pane = value;
    designer.dataset.pane = value;
    explorer.hidden = value !== "project";
    menuEditor.hidden = value !== "menus";
    if (value === "project") redrawProject();
    if (value === "menus") redrawMenus();
    if ((value === "design" || value === "properties") && module) return openForm(form, value);
    designer.hidden = !["design", "properties"].includes(value);
    editor.hidden = value !== "code";
    immediate.hidden = value !== "immediate";
    for (const [key, tab] of tabButtons) tab.setAttribute("aria-pressed", String(key === value));
    if (value === "design") layoutStage();
    if (value === "code") updateGutters();
    if (value === "immediate") immediate.scrollTop = immediate.scrollHeight;
  }

  function layoutStage() {
    const {width, height} = form;
    const scale = Math.min(1, Math.max(1, viewport.clientWidth - 16) / (width + 4));
    paper.style.width = width + 4 + "px";
    paper.style.height = height + 27 + "px";
    paper.style.transform = "scale(" + scale + ")";
    spacer.style.width = Math.ceil((width + 4) * scale) + "px";
    spacer.style.height = Math.ceil((height + 27) * scale) + "px";
  }

  function mouseOnForm(event) {
    const bounds = artboard.getBoundingClientRect();
    return {x: (event.clientX - bounds.left) * form.width / bounds.width,
      y: (event.clientY - bounds.top) * form.height / bounds.height};
  }

  function clearTool() {
    tool = "";
    updateToolSelection();
  }

  function updateToolSelection() {
    artboard.classList.toggle("lua-placing", !!tool);
    for (const [key, node] of tools) node.setAttribute("aria-pressed", String(key === tool));
  }

  function addControl(type, point) {
    if (form.controls.length >= 48) { textStatus("This form already has 48 controls."); return; }
    const spec = luaControlTypes[type];
    const name = luaFreeName(spec.prefix, formObjectNames());
    const width = Math.min(spec.width, form.width);
    const height = Math.min(spec.height, form.height);
    const snap = value => snapToGrid ? Math.round(value / 4) * 4 : Math.round(value);
    const control = luaControl(type, name, type === "text" ? "" : name,
      clamp(snap(point.x), 0, form.width - width), clamp(snap(point.y), 0, form.height - height),
      width, height);
    if (luaChoiceTypes.includes(type)) {
      control.items = ["Item 1", "Item 2", "Item 3"];
      control.value = control.items[0];
    }
    form.controls.push(control);
    clearTool();
    selected = name;
    selectedControls = new Set([name]);
    redrawDesign();
    redrawMethods();
    modified();
    textStatus(name + " added. Drag to move it or resize it from the corner.");
  }

  function selectControl(name, extend = false) {
    if (!extend || !name) selectedControls.clear();
    if (name) {
      if (extend && selectedControls.has(name)) selectedControls.delete(name);
      else selectedControls.add(name);
    }
    selected = selectedControls.has(name) ? name : ([...selectedControls].at(-1) || "");
    for (const node of artboard.children) {
      const current = selectedControls.has(node.dataset.control);
      node.classList.toggle("lua-selected", current);
      node.setAttribute("aria-selected", String(current));
    }
    redrawProperties();
  }

  function formObjectNames() {
    return [...form.controls.map(control => control.name),
      ...form.controls.map(control => control.arrayName).filter(Boolean),
      ...form.menus.flatMap(menu => [menu.name, ...menu.items.map(item => item.name)])];
  }

  function arrayNameValid(name, current) {
    if (!name) return true;
    if (!luaIdentifier.test(name) || name === "Form" || form.controls.some(peer => peer.name === name) ||
        form.menus.some(menu => menu.name === name || menu.items.some(item => item.name === name))) return false;
    return !form.controls.some(peer => peer !== current && peer.arrayName === name && peer.type !== current.type);
  }

  function ensureArrayIndex(control) {
    if (!control.arrayName) return;
    const taken = form.controls.some(peer => peer !== control && peer.arrayName === control.arrayName &&
      peer.arrayIndex === control.arrayIndex);
    if (taken) control.arrayIndex = luaArrayNextIndex(form, control.arrayName);
  }

  function createArray() {
    const current = form.controls.find(control => control.name === selected);
    if (!current) { textStatus("Select a control first."); return; }
    if (current.arrayName) { textStatus("This control already belongs to " + current.arrayName + "."); return; }
    const used = formObjectNames();
    const name = luaFreeName(current.name.slice(0, 27) + "Arr", used);
    current.arrayName = name;
    current.arrayIndex = 0;
    redrawProperties();
    redrawMethods();
    modified();
    textStatus(name + " created. Duplicate the control to add members, then edit the shared event.");
  }

  function copyControls(cut = false) {
    designerClipboard.splice(0, designerClipboard.length,
      ...form.controls.filter(control => selectedControls.has(control.name))
        .map(control => JSON.parse(JSON.stringify(control))));
    if (!designerClipboard.length) { textStatus("Select one or more controls first."); return; }
    if (cut) deleteControl();
    textStatus(designerClipboard.length + (cut ? " control(s) cut." : " control(s) copied."));
  }

  function pasteControls() {
    if (!designerClipboard.length) { textStatus("Nothing to paste."); return; }
    if (form.controls.length + designerClipboard.length > 48) {
      textStatus("This form can hold up to 48 controls."); return;
    }
    const next = [];
    const left = Math.min(...designerClipboard.map(item => item.x));
    const top = Math.min(...designerClipboard.map(item => item.y));
    for (const item of designerClipboard) {
      const name = luaFreeName(luaControlTypes[item.type].prefix, formObjectNames());
      const control = {...JSON.parse(JSON.stringify(item)), name};
      if (control.arrayName && !arrayNameValid(control.arrayName, control)) {
        control.arrayName = "";
        control.arrayIndex = 0;
      }
      ensureArrayIndex(control);
      control.width = Math.min(control.width, form.width);
      control.height = Math.min(control.height, form.height);
      control.x = clamp(item.x - left + 12, 0, form.width - control.width);
      control.y = clamp(item.y - top + 12, 0, form.height - control.height);
      form.controls.push(control);
      next.push(name);
    }
    selectedControls = new Set(next);
    selected = next.at(-1);
    redrawDesign();
    redrawMethods();
    modified();
    textStatus(next.length + " control(s) pasted. New names have been assigned.");
  }

  function arrangeControls(action) {
    const anchor = form.controls.find(control => control.name === selected);
    const group = form.controls.filter(control => selectedControls.has(control.name));
    if (!anchor) { textStatus("Select a control first."); return; }
    if (action === "duplicate") {
      if (form.controls.length + group.length > 48) { textStatus("This form already has the maximum number of controls."); return; }
      const added = [];
      for (const control of group) {
        const name = luaFreeName(luaControlTypes[control.type].prefix, formObjectNames());
        const duplicate = {...control, name, items: control.items.slice(),
          x: Math.min(form.width - control.width, control.x + 12),
          y: Math.min(form.height - control.height, control.y + 12)};
        ensureArrayIndex(duplicate);
        form.controls.push(duplicate);
        added.push(name);
      }
      selected = added[0];
      selectedControls = new Set(added);
    } else {
      if (group.length < 2) { textStatus("Select two or more controls to format them."); return; }
      const ordered = group.slice().sort((a, b) =>
        (action === "distribute-vertical" ? a.y - b.y : a.x - b.x));
      const dimension = action === "distribute-vertical" ? "y" : "x";
      const lengthKey = action === "distribute-vertical" ? "height" : "width";
      const span = ordered.at(-1)[dimension] - ordered[0][dimension];
      const middle = (group.length - 1) || 1;
      if (action.startsWith("distribute-") && group.length < 3) {
        textStatus("Select at least three controls to distribute."); return;
      }
      for (let index = 0; index < ordered.length; index++) {
        const control = ordered[index];
        if (action === "left") control.x = Math.min(anchor.x, form.width - control.width);
        if (action === "right") control.x = clamp(anchor.x + anchor.width - control.width, 0, form.width - control.width);
        if (action === "top") control.y = Math.min(anchor.y, form.height - control.height);
        if (action === "bottom") control.y = clamp(anchor.y + anchor.height - control.height, 0, form.height - control.height);
        if (action === "center-h") control.x = clamp(Math.round(anchor.x + anchor.width / 2 - control.width / 2), 0, form.width - control.width);
        if (action === "center-v") control.y = clamp(Math.round(anchor.y + anchor.height / 2 - control.height / 2), 0, form.height - control.height);
        if (["size", "width"].includes(action)) control.width = Math.min(anchor.width, form.width - control.x);
        if (["size", "height"].includes(action)) control.height = Math.min(anchor.height, form.height - control.y);
        if (action.startsWith("distribute-")) {
          control[dimension] = clamp(Math.round(ordered[0][dimension] + span * index / middle),
            0, form[dimension === "x" ? "width" : "height"] - control[lengthKey]);
        }
      }
    }
    redrawDesign();
    redrawMethods();
    modified();
  }

  function toolButton(type, label) {
    const control = element("button", "bevel lua-tool", label);
    control.type = "button";
    let origin;
    let dragged;
    control.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary) return;
      dragged = false;
      origin = {x: event.clientX, y: event.clientY, id: event.pointerId};
      control.setPointerCapture(event.pointerId);
    });
    control.addEventListener("pointermove", event => {
      if (!origin || origin.id !== event.pointerId || !type) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) {
        dragged = true;
        tool = type;
        updateToolSelection();
      }
    });
    control.addEventListener("pointercancel", () => {
      origin = null;
      if (dragged) clearTool();
      dragged = false;
    });
    control.addEventListener("pointerup", event => {
      if (!origin || origin.id !== event.pointerId) return;
      origin = null;
      if (!dragged || !type) return;
      const bounds = artboard.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right &&
          event.clientY >= bounds.top && event.clientY <= bounds.bottom) addControl(type, mouseOnForm(event));
      else clearTool();
    });
    control.addEventListener("click", event => {
      if (dragged && event.detail) { dragged = false; return; }
      tool = tool === type ? "" : type;
      updateToolSelection();
      if (tool) textStatus("Tap the form to place a " + label + ", or drag it from the Toolbox.");
      else textStatus("Ready");
    });
    tools.set(type, control);
    return control;
  }

  function layoutControl(node, control) {
    Object.assign(node.style, {left: control.x + "px", top: control.y + "px",
      width: control.width + "px", height: control.height + "px"});
  }

  function dragControl(event, node, control) {
    if (!event.isPrimary || event.button !== 0 || tool) return;
    event.stopPropagation();
    if (event.shiftKey || multiSelect) {
      selectControl(control.name, true);
      return;
    }
    if (!selectedControls.has(control.name)) selectControl(control.name);
    const start = mouseOnForm(event);
    const initial = {x: control.x, y: control.y, width: control.width, height: control.height};
    const resize = event.target.closest(".lua-resize-control");
    const group = [...artboard.children].map(widget => ({
      widget, target: form.controls.find(item => item.name === widget.dataset.control)
    })).filter(item => selectedControls.has(item.target?.name)).map(item =>
      ({...item, x: item.target.x, y: item.target.y}));
    let moved = false;
    node.setPointerCapture(event.pointerId);
    const move = next => {
      if (next.pointerId !== event.pointerId) return;
      const point = mouseOnForm(next);
      const step = snapToGrid ? 4 : 1;
      const dx = Math.round((point.x - start.x) / step) * step;
      const dy = Math.round((point.y - start.y) / step) * step;
      if (!moved && !dx && !dy) return;
      moved = true;
      if (resize) {
        control.width = clamp(initial.width + dx, 20, form.width - control.x);
        control.height = clamp(initial.height + dy, 18, form.height - control.y);
      } else {
        const left = Math.min(...group.map(item => item.x));
        const top = Math.min(...group.map(item => item.y));
        const right = Math.max(...group.map(item => item.x + item.target.width));
        const bottom = Math.max(...group.map(item => item.y + item.target.height));
        for (const item of group) {
          item.target.x = item.x + clamp(dx, -left, form.width - right);
          item.target.y = item.y + clamp(dy, -top, form.height - bottom);
          layoutControl(item.widget, item.target);
        }
      }
      layoutControl(node, control);
    };
    const finish = next => {
      if (next.pointerId !== event.pointerId) return;
      node.removeEventListener("pointermove", move);
      node.removeEventListener("lostpointercapture", finish);
      if (moved) {
        redrawProperties();
        modified();
      }
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("lostpointercapture", finish);
  }

  function redrawDesign(rebuildInspector = true) {
    title.textContent = form.caption;
    artboard.style.setProperty("--lua-form-color", form.color);
    artboard.classList.toggle("lua-no-grid", !snapToGrid);
    artboard.replaceChildren(...form.controls.map(control => {
      const node = element("div", "lua-control lua-design-control");
      node.tabIndex = 0;
      node.dataset.control = control.name;
      node.setAttribute("role", "option");
      node.setAttribute("aria-label", control.name + " (" + luaControlTypes[control.type].caption + ")");
      node.setAttribute("aria-selected", String(selectedControls.has(control.name)));
      node.classList.toggle("lua-selected", selectedControls.has(control.name));
      node.classList.toggle("lua-frame-control", control.type === "frame");
      layoutControl(node, control);
      const shape = luaObjectNode(control);
      updateLuaObject(control, shape, true);
      shape.node.tabIndex = -1;
      shape.node.setAttribute("aria-hidden", "true");
      if (shape.input) shape.input.tabIndex = -1;
      node.append(shape.node);
      const handle = element("span", "lua-resize-control");
      handle.title = "Resize control";
      node.append(handle);
      node.addEventListener("pointerdown", event => dragControl(event, node, control));
      node.addEventListener("dblclick", event => {
        event.stopPropagation();
        const on = luaEventsForType(control.type)[0];
        if (on) editHandler(control.name + "_" + on);
      });
      node.addEventListener("keydown", event => {
        if (event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          selectControl(control.name);
          deleteControl();
        }
        else if (event.key === "Enter") {
          selectControl(control.name);
          const on = luaEventsForType(control.type)[0];
          if (on) editHandler(control.name + "_" + on);
          else setPane("properties");
        }
      });
      return node;
    }));
    layoutStage();
    if (rebuildInspector) redrawProperties();
  }

  function redrawProperties() {
    const entries = element("div", "lua-property-fields");
    const current = form.controls.find(control => control.name === selected);
    const label = element("label", "lua-field");
    label.append(element("span", "", "Object"));
    const list = element("select", "text-entry");
    list.add(new Option("Form", ""));
    form.controls.forEach(control => list.add(new Option(control.name, control.name)));
    list.value = current?.name ?? "";
    list.addEventListener("change", () => selectControl(list.value));
    label.append(list);
    entries.append(label);

    const field = (name, value, type, action, limit, rebuild = false) => {
      const entry = element("label", "lua-field");
      entry.append(element("span", "", name));
      const control = element(type === "area" ? "textarea" : "input", "text-entry");
      if (type !== "area") control.type = type;
      control.value = value;
      if (limit && (type === "text" || type === "area")) control.maxLength = limit;
      if (type === "number") control.inputMode = "numeric";
      control.addEventListener("change", () => {
        const adjusted = action(type === "number" ? +control.value : control.value);
        if (adjusted !== undefined) control.value = adjusted;
        redrawDesign(rebuild);
        redrawMethods();
        modified();
      });
      entry.append(control);
      entries.append(entry);
    };
    const flag = (caption, key) => {
      const field = element("label", "check-label");
      const input = element("input");
      input.type = "checkbox";
      input.checked = current[key];
      input.addEventListener("change", () => {
        current[key] = input.checked;
        const widget = [...artboard.children].find(node => node.dataset.control === current.name);
        if (widget) {
          widget.firstChild.classList.toggle("lua-hidden-design", !current.visible);
          widget.firstChild.classList.toggle("lua-disabled-design", !current.enabled);
        }
        modified();
      });
      field.append(input, element("span", "", caption));
      entries.append(field);
    };
    const number = (label, target, key, min, max) => field(label, target[key], "number",
      value => target[key] = clamp(Math.round(value), min, max()));
    const buttons = element("div", "app-toolbar lua-property-actions");
    if (!current) {
      field("Project name", project.name, "text", value => { project.name = value.trim() || "Project1"; }, 70);
      field("Caption", form.caption, "text", value => { form.caption = value || "Form1"; }, 80);
      field("Background", form.color, "color", value => { form.color = value; });
      for (const [label, key, bounds] of [["Width", "width", [160, 720]], ["Height", "height", [108, 640]]]) {
        field(label, form[key], "number", value => {
          form[key] = luaWhole(value, ...bounds);
          for (const control of form.controls) {
            control.width = Math.min(control.width, form.width);
            control.height = Math.min(control.height, form.height);
            control.x = Math.min(control.x, form.width - control.width);
            control.y = Math.min(control.y, form.height - control.height);
          }
          return form[key];
        }, null, true);
      }
      const position = element("label", "lua-field");
      position.append(element("span", "", "Start position"));
      const placement = element("select", "text-entry");
      placement.append(new Option("Automatic", "automatic"), new Option("Manual", "manual"));
      placement.value = form.position;
      placement.addEventListener("change", () => { form.position = placement.value; redrawProperties(); modified(); });
      position.append(placement);
      entries.append(position);
      if (form.position === "manual") {
        number("Screen left", form, "left", 0, () => 2000);
        number("Screen top", form, "top", 0, () => 2000);
      }
      buttons.append(toolbarButton("Form_Load", () => editHandler("Form_Load")),
        toolbarButton("Menu Editor…", () => setPane("menus")));
    } else {
      field("Name", current.name, "text", value => {
        if (!luaIdentifier.test(value) || (value !== current.name && formObjectNames().includes(value))) {
          textStatus("Enter a unique name starting with a letter. Use letters, digits, or underscores.");
          return current.name;
        }
        // Keep all of a renamed control's event procedures together.
        for (const event of luaEventsForType(current.type)) {
          const pattern = new RegExp("(\\bfunction\\s+)" + current.name + "_" + event + "(?=\\s*\\()", "g");
          form.code = form.code.replace(pattern, "$1" + value + "_" + event);
        }
        code.value = sourceDoc().code;
        selectedControls.delete(current.name);
        selectedControls.add(value);
        selected = current.name = value;
        return value;
      }, 32, true);
      if (luaChoiceTypes.includes(current.type)) {
        field("Items (one per line)", current.items.join("\n"), "area", value => {
          current.items = [...new Set(value.split(/\r?\n/).map(line => line.trim().slice(0, 60)).filter(Boolean))].slice(0, 24);
          if (!current.items.includes(current.value)) current.value = current.items[0] || "";
        }, 1480, true);
        const field = element("label", "lua-field");
        field.append(element("span", "", "Value"));
        const choices = element("select", "text-entry");
        choices.add(new Option("", ""));
        current.items.forEach(item => choices.add(new Option(item, item)));
        choices.value = current.value;
        choices.addEventListener("change", () => { current.value = choices.value; redrawDesign(); modified(); });
        field.append(choices);
        entries.append(field);
      } else if (luaRangeTypes.includes(current.type)) {
        field("Minimum", current.min, "number", value => {
          current.min = luaWhole(value, -10000, current.max - 1);
          current.value = Math.max(current.min, current.value);
          return current.min;
        }, null, true);
        field("Maximum", current.max, "number", value => {
          current.max = luaWhole(value, current.min + 1, 10000);
          current.value = Math.min(current.max, current.value);
          return current.max;
        }, null, true);
        number("Value", current, "value", current.min, () => current.max);
      } else if (current.type === "timer") {
        number("Interval (ms)", current, "interval", 100, () => 60000);
      } else if (["line", "shape"].includes(current.type)) {
        field("Color", current.color, "color", value => { current.color = value; });
        if (current.type === "shape") {
          const kind = element("label", "lua-field");
          kind.append(element("span", "", "Shape"));
          const variants = element("select", "text-entry");
          variants.add(new Option("Rectangle", "rectangle"));
          variants.add(new Option("Ellipse", "ellipse"));
          variants.value = current.shape;
          variants.addEventListener("change", () => { current.shape = variants.value; redrawDesign(false); modified(); });
          kind.append(variants);
          entries.append(kind);
        }
      } else if (luaImageTypes.includes(current.type)) {
        buttons.append(toolbarButton("Choose Image…", () => {
          pictureTarget = {form, control: current};
          native?.desktopFile?.("lua-image", "", "");
        }), toolbarButton("Clear Image", () => {
          current.image = "";
          redrawDesign();
          modified();
        }));
      } else field(luaTextTypes.includes(current.type) ? "Text" : "Caption", current.text,
        current.type === "multiline" ? "area" : "text", value => { current.text = value; }, 500);
      // VB6-style control arrays retain a stable physical ID but share event code
      // through (Array name, Index). Existing single controls stay unchanged.
      field("Array name", current.arrayName || "", "text", value => {
        value = value.trim();
        if (!arrayNameValid(value, current)) {
          textStatus("Choose a unique array name. Members must use the same control type.");
          return current.arrayName || "";
        }
        if (value !== current.arrayName) {
          current.arrayName = value;
          current.arrayIndex = 0;
          ensureArrayIndex(current);
          // Reveal/hide the Index field immediately after editing Array name.
          setTimeout(redrawProperties, 0);
        }
        return current.arrayName;
      }, 32, true);
      if (current.arrayName) {
        field("Index (0–255)", current.arrayIndex, "number", value => {
          if (!Number.isInteger(value) || value < 0 || value > 255 ||
              form.controls.some(peer => peer !== current && peer.arrayName === current.arrayName &&
                peer.arrayIndex === value)) {
            textStatus("This array needs an unused index from 0 to 255.");
            return current.arrayIndex;
          }
          current.arrayIndex = value;
          return value;
        }, null, true);
        buttons.append(toolbarButton("Edit " + current.arrayName + "_" + (luaEventsForType(current.type)[0] || "Click"),
          () => editHandler(current.arrayName + "_" + (luaEventsForType(current.type)[0] || "Click"))));
      } else buttons.append(toolbarButton("Create Control Array", createArray));
      number("Left", current, "x", 0, () => form.width - current.width);
      number("Top", current, "y", 0, () => form.height - current.height);
      number("Width", current, "width", 20, () => form.width - current.x);
      number("Height", current, "height", 18, () => form.height - current.y);
      if (current.type === "option") field("Group", current.group, "text", value => {
        current.group = value.trim() || "Group1";
        return current.group;
      }, 32);
      if (luaTickTypes.includes(current.type)) flag("Checked", "checked");
      if (current.type !== "timer") flag("Visible", "visible");
      flag("Enabled", "enabled");
      if (luaInputProperty(current) || current.type === "button") {
        flag("Tab stop", "tabStop");
        number("Tab order", current, "tabIndex", 0, () => 99);
      }
      const event = luaEventsForType(current.type)[0];
      if (event && !current.arrayName) buttons.append(toolbarButton(current.name + "_" + event, () => editHandler(current.name + "_" + event)));
      buttons.append(toolbarButton("Delete Control", deleteControl));
    }
    inspector.replaceChildren(element("div", "lua-pane-title", "Properties"), entries, buttons);
  }

  function deleteControl() {
    if (!selected) return;
    form.controls = form.controls.filter(control => !selectedControls.has(control.name));
    selected = "";
    selectedControls.clear();
    redrawDesign();
    redrawMethods();
    modified();
  }

  function redrawMethods() {
    if (module) {
      objects.hidden = eventKinds.hidden = openEvent.hidden = true;
      return;
    }
    const all = ["Form", ...new Set(form.controls.map(item => item.arrayName || item.name)),
      ...luaMenuCommands(form).map(item => item.name)];
    const split = method.lastIndexOf("_");
    const wanted = split > 0 ? method.slice(0, split) : "Form";
    const chosen = all.includes(wanted) ? wanted : "Form";
    objects.replaceChildren(...all.map(item => new Option(item, item)));
    objects.value = chosen;
    const control = form.controls.find(item => (item.arrayName || item.name) === chosen);
    const events = chosen === "Form" ? luaFormEvents : control ? luaEventsForType(control.type) : ["Click"];
    const wantedEvent = split > 0 ? method.slice(split + 1) : "";
    eventKinds.replaceChildren(...events.map(event => new Option(event, event)));
    eventKinds.value = events.includes(wantedEvent) ? wantedEvent : events[0];
    method = chosen + "_" + eventKinds.value;
    objects.hidden = eventKinds.hidden = openEvent.hidden = false;
  }

  function editHandler(name) {
    if (!name || module) return;
    method = name;
    redrawMethods();
    setPane("code");
    const existing = new RegExp("(^|\\n)[ \\t]*function[ \\t]+" + name + "[ \\t]*\\(").exec(code.value);
    let line;
    let cursor;
    if (existing) {
      line = code.value.slice(0, existing.index).split("\n").length + (existing.index ? 1 : 0);
      cursor = code.value.indexOf("\n", existing.index + existing[0].length);
      if (cursor < 0) cursor = code.value.length;
      else cursor++;
    } else {
      const split = name.lastIndexOf("_");
      const subject = name.slice(0, split);
      const event = name.slice(split + 1);
      const member = form.controls.find(control => control.arrayName === subject || control.name === subject);
      const signature = luaHandlerSignature(member, event);
      const stub = "function " + name + "(" + signature + ")\n  \nend\n";
      const leading = code.value.trimEnd();
      const result = (leading ? leading + "\n\n" : "") + stub;
      if (result.length > luaMaxCode) { textStatus("Main.lua is full."); return; }
      cursor = result.length - "\nend\n".length;
      line = result.slice(0, cursor).split("\n").length;
      code.value = result;
      codeChanged();
    }
    code.focus();
    code.setSelectionRange(cursor, cursor);
    scrollToCodeLine(line);
    textStatus("Editing " + name);
  }

  function syncSource() {
    codeCaption.textContent = sourceName();
    code.setAttribute("aria-label", "Lua source");
    code.value = sourceDoc().code;
    code.setSelectionRange(0, 0);
    caretOffset = 0;
    updateGutters();
    redrawMethods();
  }

  function openForm(next, view = "design") {
    if (next !== form || module) {
      selected = "";
      selectedControls.clear();
      method = "Form_Load";
      clearTool();
    }
    form = next;
    module = null;
    syncSource();
    redrawDesign();
    setPane(view);
  }

  function openModule(next) {
    module = next;
    syncSource();
    setPane("code");
  }

  function redrawProject() {
    const head = element("div", "app-toolbar");
    const startup = element("label", "lua-field");
    startup.append(element("span", "", "Startup form"));
    const choices = element("select", "text-entry");
    choices.replaceChildren(...project.forms.map(item => new Option(item.name, item.name)));
    choices.value = project.startup;
    choices.addEventListener("change", () => { project.startup = choices.value; redrawProject(); modified(); });
    startup.append(choices);
    head.append(toolbarButton("Add Form", () => addProjectItem("form")),
      toolbarButton("Add Module", () => addProjectItem("module")), startup);
    const rows = element("div", "explorer lua-project-rows");
    const sections = [["Forms", project.forms, openForm], ["Modules", project.modules, openModule]];
    for (const [label, entries, open] of sections) {
      rows.append(element("div", "program-group", label));
      for (const item of entries) {
        const row = element("div", "lua-project-row");
        const openItem = toolbarButton(item.name + (label === "Forms" && project.startup === item.name ? " (Startup)" : ""),
          () => open(item));
        const rename = toolbarButton("Rename…", () => nameDialog("Rename", item.name, name => {
          if (!luaIdentifier.test(name) || [...project.forms, ...project.modules].some(peer => peer !== item && peer.name === name)) {
            textStatus("Use a unique name starting with a letter.");
            return;
          }
          if (project.startup === item.name) project.startup = name;
          if (breakpoints.has(item.name)) {
            breakpoints.set(name, breakpoints.get(item.name));
            if (item.name !== name) breakpoints.delete(item.name);
          }
          item.name = name;
          syncSource();
          redrawProject();
          modified();
        }));
        const remove = toolbarButton("Remove…", () => dialog({
          kind: "lua-remove-item", title: "Remove " + item.name, icon: "lua",
          message: "Remove this file from the project?", accept: "Remove", cancel: "Cancel", onAccept: () => {
            breakpoints.delete(item.name);
            project.forms = project.forms.filter(peer => peer !== item);
            project.modules = project.modules.filter(peer => peer !== item);
            if (project.startup === item.name) project.startup = project.forms[0].name;
            if (form === item) form = project.forms[0];
            if (module === item) module = null;
            selected = "";
            selectedControls.clear();
            syncSource();
            redrawProject();
            modified();
          }}));
        remove.disabled = label === "Forms" && project.forms.length <= 1;
        row.append(openItem, rename, remove);
        rows.append(row);
      }
    }
    explorer.replaceChildren(element("div", "lua-pane-title", "Project Explorer · " + project.name), head, rows);
  }

  function addProjectItem(kind) {
    const list = kind === "form" ? project.forms : project.modules;
    if (list.length >= (kind === "form" ? 8 : 12)) { textStatus("The project has reached its file limit."); return; }
    const name = luaFreeName(kind === "form" ? "Form" : "Module", [...project.forms, ...project.modules].map(item => item.name));
    const item = kind === "form" ? luaNewForm(name) : {name, code: "-- Functions declared here are available to the forms.\n"};
    list.push(item);
    modified();
    if (kind === "form") openForm(item);
    else openModule(item);
  }

  function redrawMenus() {
    if (module) {
      module = null;
      syncSource();
    }
    const rows = element("div", "explorer lua-menu-rows");
    const add = (items, submenu) => {
      if (items.length >= (submenu ? 14 : 10)) { textStatus("This menu has reached its item limit."); return; }
      const name = luaFreeName("Menu", formObjectNames());
      items.push({name, caption: submenu ? "Command" : "Menu", enabled: true, ...(submenu ? {} : {items: []})});
      redrawMenus();
      redrawMethods();
      modified();
    };
    const menuRow = (item, list, nested = false) => {
      const row = element("div", "lua-menu-editor-row");
      row.classList.toggle("lua-menu-indent", nested);
      const caption = element("input", "text-entry");
      caption.setAttribute("aria-label", "Caption for " + item.name);
      caption.maxLength = 65;
      caption.value = item.caption;
      caption.addEventListener("change", () => { item.caption = caption.value || item.name; modified(); });
      const name = element("input", "text-entry");
      name.setAttribute("aria-label", "Name for " + item.name);
      name.maxLength = 32;
      name.value = item.name;
      name.addEventListener("change", () => {
        const proposed = name.value.trim();
        if (proposed === item.name) return;
        if (!luaIdentifier.test(proposed) || formObjectNames().includes(proposed)) {
          name.value = item.name;
          textStatus("Use a unique menu name beginning with a letter.");
          return;
        }
        const pattern = new RegExp("(\\bfunction\\s+)" + item.name + "_Click(?=\\s*\\()", "g");
        form.code = form.code.replace(pattern, "$1" + proposed + "_Click");
        item.name = proposed;
        syncSource();
        redrawMenus();
        modified();
      });
      row.append(caption, name);
      const actions = element("div", "app-toolbar");
      if (!item.items?.length) actions.append(toolbarButton("Click Event", () => editHandler(item.name + "_Click")));
      if (!nested) actions.append(toolbarButton("Add Item", () => add(item.items, true)));
      const up = toolbarButton("Up", () => {
        const index = list.indexOf(item);
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        redrawMenus();
        modified();
      });
      up.disabled = list[0] === item;
      const enabled = toolbarButton(item.enabled ? "Enabled" : "Disabled", () => {
        item.enabled = !item.enabled;
        redrawMenus();
        modified();
      });
      actions.append(up, enabled, toolbarButton("Remove", () => {
        list.splice(list.indexOf(item), 1);
        redrawMenus();
        redrawMethods();
        modified();
      }));
      row.append(actions);
      return row;
    };
    for (const menu of form.menus) {
      rows.append(menuRow(menu, form.menus), ...menu.items.map(item => menuRow(item, menu.items, true)));
    }
    const head = element("div", "app-toolbar");
    head.append(toolbarButton("Add Menu", () => add(form.menus, false)), toolbarButton("Back to Form", () => setPane("design")));
    menuEditor.replaceChildren(element("div", "lua-pane-title", "Menu Editor · " + form.name), head, rows);
  }

  function markLine(line) {
    const lines = code.value.split("\n");
    if (line < 1 || line > lines.length) return;
    const marks = breakpoints.get(sourceDoc().name) || new Set();
    if (marks.has(line)) marks.delete(line);
    else marks.add(line);
    breakpoints.set(sourceDoc().name, marks);
    updateGutters();
    textStatus((marks.has(line) ? "Breakpoint on " : "Removed breakpoint at ") + sourceName() + ":" + line);
  }

  function gotoLine(line, focus = true) {
    setPane("code");
    const lines = code.value.split("\n");
    line = luaWhole(line, 1, lines.length, 1);
    const cursor = lines.slice(0, line - 1).reduce((a, b) => a + b.length + 1, 0);
    if (focus) code.focus();
    code.setSelectionRange(cursor, cursor + lines[line - 1].length);
    scrollToCodeLine(line);
    updateGutters();
  }

  function showPaused(info) {
    const key = info.file.replace(/\.lua$/, "");
    const pausedForm = project.forms.find(item => item.name === key);
    const pausedModule = project.modules.find(item => item.name === key);
    if (pausedForm) openForm(pausedForm, "code");
    else if (pausedModule) openModule(pausedModule);
    gotoLine(info.line, false);
    const data = element("pre", "lua-debug-values");
    const localValues = info.locals?.map(item => item.name + " = " + item.value).join("\n") || "(none)";
    const stack = info.stack?.join("\n") || info.file + ":" + info.line;
    const watchValues = info.watches?.map(item => item.name + " = " + item.value).join("\n");
    data.textContent = "Locals\n" + localValues + (watchValues ? "\n\nWatches\n" + watchValues : "") +
      "\n\nCall Stack\n" + stack;
    const bar = element("div", "app-toolbar");
    bar.append(toolbarButton("Continue", () => resume("continue")), toolbarButton("Step Into", () => resume("into")),
      toolbarButton("Step Over", () => resume("over")), toolbarButton("Step Out", () => resume("out")));
    debugPanel.replaceChildren(element("div", "lua-pane-title", "Break · " + info.file + ":" + info.line), bar, data);
    debugPanel.hidden = false;
    focusWindow(win);
    textStatus("Paused at " + info.file + ":" + info.line);
  }

  function resume(action) {
    if (runtime?.resume(action)) {
      debugPanel.hidden = true;
      textStatus("Running " + project.name);
    }
  }

  function appendLogs(lines) {
    if (!lines.length) return;
    logs.push(...lines);
    if (logs.length > 220) logs.splice(0, logs.length - 220);
    immediate.textContent = logs.join("\n");
    immediate.scrollTop = immediate.scrollHeight;
  }

  function switchProject(next, programId = "") {
    const accept = () => {
      runtime?.stop();
      project = luaProject(next);
      publishedId = programId;
      form = project.forms.find(entry => entry.name === project.startup);
      module = null;
      selected = "";
      selectedControls.clear();
      breakpoints.clear();
      watches = [];
      method = "Form_Load";
      syncSource();
      backup = JSON.stringify(project);
      resetHistory();
      clearTool();
      logs.length = 0;
      immediate.textContent = "";
      redrawDesign();
      redrawMethods();
      setPane("design");
      persist();
      textStatus("Ready");
    };
    if (backup && JSON.stringify(project) !== backup) {
      dialog({kind: "lua-discard", title: "Lua Studio", icon: "lua",
        message: "Replace the current project? Save a project file first to keep these changes.",
        accept: "Replace", cancel: "Cancel", onAccept: accept});
    } else accept();
  }

  function saveFile(action) {
    if (!native?.desktopFile) { textStatus("Use the Android launcher to save project files."); return; }
    const snapshot = JSON.stringify(project);
    if (snapshot.length > luaMaxPayload) { textStatus("The project is too large to save."); return; }
    fileRequest = "lua-" + luaSession();
    const exporting = action === "export-lua";
    win.luaFileSaved = result => {
      if (result.id !== fileRequest) return;
      fileRequest = "";
      if (result.ok && !exporting) backup = snapshot;
      if (result.message) textStatus(result.message);
    };
    native.desktopFile(action, fileRequest, exporting ? JSON.stringify({name: sourceName(), code: sourceDoc().code}) : snapshot);
  }

  function publishProgram() {
    if (!native?.publishLuaProgram) { textStatus("Publishing is available in the Android launcher."); return; }
    refreshLuaPrograms();
    const original = luaPrograms.get(publishedId);
    nameDialog(original ? "Update Lua Program" : "Add to Programs", project.name, name => {
      try {
        const copy = luaProject({...project, name});
        const result = JSON.parse(native.publishLuaProgram(original?.id || "", JSON.stringify(copy)));
        if (result.error || !isLuaProgramId(result.id)) throw Error(result.error || "Could not publish the program.");
        project.name = copy.name;
        publishedId = result.id;
        backup = JSON.stringify(project);
        persist();
        redrawDesign();
        if (pane === "project") redrawProject();
        refreshLuaPrograms();
        const message = (original ? "Program updated in Start → Programs." : "Added to Start → Programs → Lua Programs.");
        textStatus(message);
        announce(message);
      } catch (error) {
        textStatus(error.message);
        announce(error.message);
      }
    });
  }

  function run(step = false) {
    if (!native?.luaCommand) { textStatus("The Lua engine is available in the Android launcher."); return; }
    if (runtime?.paused) { resume(step ? "into" : "continue"); return; }
    const snapshot = JSON.stringify(project);
    if (snapshot.length > luaMaxPayload - 16000) { textStatus("This project exceeds the Lua engine’s size limit."); return; }
    persist();
    runtime?.stop();
    if (activeLuaProjects.size >= 5) { textStatus("Close a Lua program before starting a preview."); return; }
    const marks = Object.fromEntries([...breakpoints].map(([name, lines]) => [name + ".lua", [...lines].slice(0, 60)]));
    runtime = launchLuaProject(JSON.parse(snapshot), {breakpoints: marks, watches, step,
      onLog: appendLogs, onPause: showPaused,
      onError: error => {
        appendLogs([error]);
        textStatus(error.split("\n")[0]);
      },
      onEnd: () => { stopButton.disabled = true; debugPanel.hidden = true; }
    });
    stopButton.disabled = false;
    textStatus("Running " + project.name);
    runtime.start();
  }

  const stopButton = toolbarButton("Stop", () => runtime?.stop());
  stopButton.disabled = true;
  const file = windowMenu("File", [
    ["New Project", "paper", () => switchProject(luaExample("blank"))],
    ["Open Project…", "folder", () => openFileLocation("projects")],
    ["Import Project…", "folder", () => native?.desktopFile?.("open-lua-project", "", "")],
    ["Save Project", "paper", () => saveFile("save-lua-project")],
    ["Add to Programs…", "programs", publishProgram],
    ["Import Lua Source…", "folder", () => native?.desktopFile?.("import-lua-source", "", "")],
    ["Export Lua Source", "paper", () => saveFile("export-lua")],
    ["Export Project ZIP", "zip", () => saveFile("export-lua-zip")],
    null, ["Close", "", () => closeWindow(win.id)]
  ]);
  const edit = windowMenu("Edit", [
    ["Undo", "", () => travelHistory(-1)], ["Redo", "", () => travelHistory(1)],
    null,
    ["Cut Controls", "", () => copyControls(true)],
    ["Copy Controls", "", () => copyControls()],
    ["Paste Controls", "", pasteControls],
    ["Delete Controls", "", deleteControl],
    ["Create Control Array", "", createArray]
  ]);
  const examples = windowMenu("Examples", [
    ["Click Counter", "calculator", () => switchProject(luaExample("counter"))],
    ["Hello Form", "lua", () => switchProject(luaExample("greeter"))],
    ["Event Playground", "lua", () => switchProject(luaExample("events"))],
    ["Two-Form Project", "lua", () => switchProject(luaTwoFormExample())],
    ["Control Arrays", "lua", () => switchProject(luaControlArrayExample())],
    ["Modal Dialog", "lua", () => switchProject(luaModalExample())],
    ["Common Controls", "lua", () => switchProject(luaCommonControlsExample())],
    ["Common Dialogs", "lua", () => switchProject(luaDialogsExample())]
  ]);
  const help = windowMenu("Help", [
    ["Lua form events", "lua", () => showLuaHelp()],
    ["Object Browser…", "find", () => showLuaBrowser(win)]
  ]);
  const layout = windowMenu("Layout", [
    ["Select Multiple", "desktop", () => {
      multiSelect = !multiSelect;
      setPane("design");
      textStatus(multiSelect ? "Tap controls to add or remove them from the selection." : "Multiple selection disabled.");
    }],
    ["Align Left", "", () => arrangeControls("left")],
    ["Align Right", "", () => arrangeControls("right")],
    ["Align Top", "", () => arrangeControls("top")],
    ["Align Bottom", "", () => arrangeControls("bottom")],
    ["Center Horizontally", "", () => arrangeControls("center-h")],
    ["Center Vertically", "", () => arrangeControls("center-v")],
    ["Space Horizontally", "", () => arrangeControls("distribute-horizontal")],
    ["Space Vertically", "", () => arrangeControls("distribute-vertical")],
    ["Make Same Width", "", () => arrangeControls("width")],
    ["Make Same Height", "", () => arrangeControls("height")],
    ["Make Same Size", "", () => arrangeControls("size")],
    ["Duplicate", "", () => arrangeControls("duplicate")],
    ["Toggle Grid Snap", "", () => { snapToGrid = !snapToGrid; redrawDesign(false); }],
    null,
    ["Automatic Density", "", () => chooseDensity("auto", "Automatic density")],
    ["Compact Density", "", () => chooseDensity("compact", "Compact density")],
    ["Standard Density", "", () => chooseDensity("standard", "Standard density")]
  ]);
  const debug = windowMenu("Debug", [
    ["Toggle Breakpoint", "", () => {
      const line = code.value.slice(0, caretOffset).split("\n").length;
      setPane("code");
      markLine(line);
    }],
    ["Step Into", "", () => run(true)],
    ["Step Over", "", () => resume("over")],
    ["Step Out", "", () => resume("out")],
    ["Edit Watches…", "", () => nameDialog("Watch Names", watches.join(", "), value => {
      const names = value.split(",").map(name => name.trim()).filter(Boolean);
      if (names.length > 12 || names.some(name => !/^[a-z_][a-z0-9_]{0,31}$/i.test(name))) {
        textStatus("Enter up to 12 variable names, separated by commas.");
        return;
      }
      watches = [...new Set(names)];
      textStatus("Watches will apply the next time you run.");
    }, 410)],
    ["Clear Watches", "", () => { watches = []; textStatus("Watches cleared for the next run."); }],
    ["Clear Breakpoints", "", () => { breakpoints.clear(); updateGutters(); textStatus("Breakpoints cleared."); }]
  ]);
  menuBar.append(file, edit, examples, layout, debug, help);
  const runButton = toolbarButton("Run", () => run());
  runButton.classList.add("lua-run");
  runButton.title = "Run (F5 or Ctrl+Enter)";
  toolbar.append(runButton, stopButton, toolbarButton("Save", () => saveFile("save-lua-project")));
  for (const [id, label] of [["project", "Project"], ["design", "Form"], ["properties", "Properties"], ["code", "Code"], ["immediate", "Immediate"]]) {
    const control = toolbarButton(label, () => setPane(id));
    tabButtons.set(id, control);
    tabs.append(control);
  }
  const rack = element("div", "lua-tool-rack");
  rack.setAttribute("role", "group");
  rack.setAttribute("aria-label", "Toolbox");
  rack.append(toolButton("", "Pointer"), ...Object.entries(luaControlTypes).map(([key, spec]) => toolButton(key, spec.caption)));
  toolbox.append(element("div", "lua-pane-title", "Toolbox"), rack);
  paper.append(title, artboard);
  spacer.append(paper);
  viewport.append(spacer);
  stage.append(viewport);
  designer.append(toolbox, stage, inspector);
  artboard.setAttribute("role", "listbox");
  artboard.setAttribute("aria-label", "Form designer");
  artboard.setAttribute("aria-multiselectable", "true");
  artboard.addEventListener("click", event => {
    if (tool) addControl(tool, mouseOnForm(event));
    else if (!event.target.closest(".lua-design-control")) selectControl("");
  });
  code.maxLength = luaMaxCode;
  code.wrap = "off";
  code.spellcheck = false;
  code.setAttribute("aria-label", "Lua source");
  code.value = sourceDoc().code;
  code.addEventListener("input", codeChanged);
  for (const event of ["select", "keyup", "blur"]) {
    code.addEventListener(event, () => { caretOffset = code.selectionStart; });
  }
  debug.addEventListener("pointerdown", () => {
    if (document.activeElement === code) caretOffset = code.selectionStart;
  });
  code.addEventListener("scroll", () => { gutters.scrollTop = code.scrollTop; });
  gutters.title = "Click a line number to toggle a breakpoint";
  gutters.addEventListener("click", event => {
    const top = parseFloat(getComputedStyle(gutters).paddingTop);
    const line = Math.floor((event.clientY - gutters.getBoundingClientRect().top - top + gutters.scrollTop) /
      codeLineHeight()) + 1;
    markLine(line);
  });
  code.addEventListener("keydown", event => {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      if (code.value.length >= luaMaxCode - 2) return;
      code.setRangeText("  ", code.selectionStart, code.selectionEnd, "end");
      codeChanged();
    }
  });
  win.node.addEventListener("keydown", event => {
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (command && !event.altKey && ((key === "z" && !event.shiftKey) || key === "y" ||
        (key === "z" && event.shiftKey)) &&
        (pane === "code" || pane === "design") &&
        (document.activeElement === code || document.activeElement === artboard ||
          document.activeElement === win.node || document.activeElement?.classList.contains("lua-design-control"))) {
      event.preventDefault();
      travelHistory(key === "z" && !event.shiftKey ? -1 : 1);
      return;
    }
    if (command && pane === "design" && ["c", "x", "v"].includes(key) &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      if (key === "c") copyControls();
      if (key === "x") copyControls(true);
      if (key === "v") pasteControls();
      return;
    }
    if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
      event.preventDefault();
      run();
    }
    if (event.key === "F7") {
      event.preventDefault();
      setPane(event.shiftKey ? "design" : "code");
    }
    if (event.key === "F4") {
      event.preventDefault();
      setPane("properties");
    }
    if (event.key === "F9" && pane === "code") {
      event.preventDefault();
      markLine(code.value.slice(0, document.activeElement === code ? code.selectionStart : caretOffset).split("\n").length);
    }
    if (event.key === "F8") {
      event.preventDefault();
      run(true);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && pane === "code") {
      event.preventDefault();
      findRow.hidden = !findRow.hidden;
      if (!findRow.hidden) findText.focus();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveFile("save-lua-project");
    }
    if (event.key === "Escape" && pane === "design" && tool) {
      event.stopPropagation();
      clearTool();
      textStatus("Ready");
    }
  });
  const openEvent = toolbarButton("Open Event", () => editHandler(objects.value + "_" + eventKinds.value));
  actions.append(codeCaption, objects, eventKinds, openEvent);
  objects.addEventListener("change", () => {
    method = objects.value + "_" + (objects.value === "Form" ? "Load" : "Click");
    redrawMethods();
  });
  eventKinds.addEventListener("change", () => { method = objects.value + "_" + eventKinds.value; });
  const source = element("div", "lua-source");
  gutters.setAttribute("aria-hidden", "true");
  const findRow = element("div", "app-toolbar lua-find-bar");
  findRow.hidden = true;
  const findText = element("input", "text-entry");
  findText.placeholder = "Find";
  findText.setAttribute("aria-label", "Find text");
  const replacement = element("input", "text-entry");
  replacement.placeholder = "Replace with";
  replacement.setAttribute("aria-label", "Replacement text");
  const findNext = () => {
    const key = findText.value;
    if (!key) return;
    const start = code.value.indexOf(key, code.selectionEnd);
    const position = start < 0 ? code.value.indexOf(key) : start;
    if (position < 0) { textStatus("Text not found."); return; }
    code.focus();
    code.setSelectionRange(position, position + key.length);
    scrollToCodeLine(code.value.slice(0, position).split("\n").length);
  };
  const lineField = element("input", "text-entry lua-line-number");
  lineField.type = "number";
  lineField.min = "1";
  lineField.placeholder = "Line";
  lineField.setAttribute("aria-label", "Go to line number");
  findRow.append(findText, toolbarButton("Find Next", findNext), replacement, toolbarButton("Replace", () => {
    if (!findText.value) return;
    const {selectionStart, selectionEnd} = code;
    if (code.value.slice(selectionStart, selectionEnd) !== findText.value) { findNext(); return; }
    if (code.value.length + replacement.value.length - findText.value.length > luaMaxCode) return;
    code.setRangeText(replacement.value, selectionStart, selectionEnd, "end");
    codeChanged();
    findNext();
  }), lineField, toolbarButton("Go", () => gotoLine(Number(lineField.value))));
  actions.append(toolbarButton("Find…", () => {
    findRow.hidden = !findRow.hidden;
    if (!findRow.hidden) findText.focus();
  }));
  source.append(gutters, code);
  editor.append(actions, findRow, source, debugPanel);
  immediate.textContent = "Output from print() and Lua errors appear here.";
  chrome.append(menuBar, toolbar);
  shell.append(chrome, tabs, explorer, designer, menuEditor, editor, immediate, status);
  win.body.replaceChildren(shell);
  win.refreshLuaDensity = applyDensity;
  applyDensity();
  const observer = new ResizeObserver(() => {
    applyDensity();
    if (pane === "design") layoutStage();
  });
  observer.observe(shell);
  observer.observe(viewport);
  win.cleanup = () => {
    persist();
    observer.disconnect();
    runtime?.stop();
  };
  win.loadLuaStudioFile = (value, programId) => {
    try { switchProject(luaProject(value), isLuaProgramId(programId) ? programId : ""); }
    catch (error) { textStatus(error.message); }
  };
  win.loadLuaSource = source => {
    if (typeof source !== "string" || source.length > luaMaxCode || source === sourceDoc().code) return;
    dialog({kind: "lua-replace-code", title: "Import Lua Source", icon: "lua",
      message: "Replace " + sourceName() + " with this file?",
      accept: "Import", cancel: "Cancel", onAccept: () => {
        runtime?.stop();
        code.value = source;
        codeChanged();
        setPane("code");
        textStatus("Source imported into " + sourceName());
      }});
  };
  win.loadLuaImage = encoded => {
    const target = pictureTarget;
    pictureTarget = null;
    if (!target || !project.forms.includes(target.form) || !target.form.controls.includes(target.control) ||
        typeof encoded !== "string" || !/^[a-z0-9+/]+=*$/i.test(encoded)) return;
    const old = target.control.image;
    target.control.image = "data:image/jpeg;base64," + encoded;
    if (JSON.stringify(project).length > luaMaxPayload - 16000) {
      target.control.image = old;
      textStatus("The image would exceed the project’s size limit.");
      return;
    }
    redrawDesign();
    modified();
  };
  redrawDesign();
  syncSource();
  updateToolSelection();
  setPane("design");
  resetHistory();
}

function showLuaHelp() {
  dialog({kind: "lua-help", title: "Lua Studio Help", icon: "lua", height: 302,
    message: "Tap a Toolbox control and then tap the form. Drag a placed control or its resize handle. " +
      "Double-click a control or choose its event in Properties to write a handler. " +
      "Use ui.get(name[, property]) and ui.set(name[, property], value). Properties are text, checked, value, enabled, and visible. " +
      "Use print() for Immediate output and ui.message() for a message. The Code pane has VB6-style Object and Event selectors. " +
      "Change(value) receives the changed value. KeyDown(event), MouseDown(event), and DblClick(event) receive " +
      "an event table with key, code, x, y, button, shift, ctrl, and alt where applicable. " +
      "TreeView, ListView, TabStrip and Toolbar use an Items list and Value selection; StatusBar uses Text. " +
      "Use ui.setItems(name, newlineSeparatedItems) to replace selectable options. " +
      "ui.dialog(kind, title, message, defaultValue) opens a nonblocking message, confirm, input or color dialog. " +
      "Handle Form_DialogResult(event) with event.id, event.kind, event.accepted and event.value. " +
      "Use Edit for designer Undo, Redo, Copy, and Paste. Control arrays share one handler: " +
      "Buttons_Click(index, event). Use ui.getAt(array, index, property) or " +
      "ui.setAt(array, index, property, value). ui.showModal(form) displays a modal window " +
      "without blocking Lua execution. Press Run to test your form.",
    accept: "OK", onAccept: () => {}});
}

function luaSession() {
  return Array.from(crypto.getRandomValues(new Uint32Array(3)), value => value.toString(36)).join("-");
}

window.luaProjectOpened = reply => openWindow("lua-studio").loadLuaStudioFile(reply.project);
window.luaSourceOpened = reply => openWindow("lua-studio").loadLuaSource(reply.code);

window.luaImageOpened = reply => openWindows.get("$lua-studio")?.loadLuaImage(reply.image);

function showLuaBrowser(studio) {
  const references = [
    ["ui.get(name, property, form)", "Read a control. Omit property to read its main value. Form is optional."],
    ["ui.set(name, property, value, form)", "Change a property. ui.set(name, value) sets the main value. Form is optional."],
    ["ui.show(form)", "Show a named form. Form_Load runs on first show and Form_Activate runs on each show."],
    ["ui.hide(form)", "Hide a form and preserve its Lua state. Omit the name for the current form."],
    ["ui.unload(form)", "Call Form_Unload and reset the form. Omit the name for the current form."],
    ["ui.getAt(array, index, property, form)", "Read one member of a control array. Omit property to read its main value; form is optional."],
    ["ui.setAt(array, index, property, value, form)", "Set one indexed control member. For example, ui.setAt('Buttons', 0, 'text', 'Go')."],
    ["ui.showModal(form)", "Show a form and prevent input to other forms in this Lua project until the modal is hidden or unloaded. Non-blocking for Lua scripts."],
    ["Control arrays", "Select a control and choose Create Control Array. Duplicate it for new indexes. Use shared handlers, e.g. Buttons_Click(index, event)."],
    ["ui.message(text)", "Write a nonmodal message to the preview status and Immediate."],
    ["ui.dialog(kind, title, message, defaultValue)", "Open message, confirm, input, or color dialog. Returns a request ID; handle Form_DialogResult(event)."],
    ["Form_DialogResult(event)", "Async dialog result: event.id, event.kind, event.accepted, event.value. No blocking or synchronous return."],
    ["ui.getItems(name, form)", "Return newline-separated items for a ListBox, ComboBox, TreeView, ListView, TabStrip or Toolbar."],
    ["ui.setItems(name, text, form)", "Replace a selectable control's items with newline-separated names (up to 24)."],
    ["store.get(key), store.set(key, value), store.remove(key)", "Per-program small string settings store. Persisted for published Lua programs, temporary in Studio Run."],
    ["*_Change(value)", "Changed text, checkbox, selection or scrollbar. First argument is the new value."],
    ["*_KeyDown(event)", "Keyboard event table: key, code, shift, ctrl, alt."],
    ["*_MouseDown(event)", "Pointer event table: x, y, button, shift, ctrl, alt."],
    ["*_DblClick(event)", "Double-click handler with pointer information."],
    ["print(…)", "Write text and values to Immediate."],
    ["shared", "A Lua table shared across the project’s modules and forms."]
  ];
  const rows = Object.entries(luaControlTypes).map(([type, spec]) => {
    const props = ["enabled", "visible"];
    const primary = luaInputProperty({type});
    if (primary) props.push(primary);
    if (["button", "label", "frame", "check", "option"].includes(type)) props.push("text");
    if (type === "progress") props.push("value");
    if (type === "timer") props.push("interval");
    return [spec.caption, "Properties: " + props.join(", ") + (spec.event ? " · Event: _" + spec.event : "")];
  });
  const win = openWindow("lua-reference", "$lua-reference", {title: "Lua Studio Object Browser", icon: "lua", height: 442,
    render: reference => {
      const filter = element("input", "text-entry");
      filter.type = "search";
      filter.placeholder = "Find a control, property, or function";
      filter.setAttribute("aria-label", "Search Lua reference");
      const list = element("div", "explorer lua-reference-list");
      const refresh = () => {
        const search = filter.value.trim().toLowerCase();
        list.replaceChildren(...[...references, ...rows].filter(pair => pair.join(" ").toLowerCase().includes(search))
          .map(([name, info]) => {
            const node = element("div", "lua-reference-row");
            node.append(element("strong", "", name), element("span", "", info));
            return node;
          }));
      };
      filter.addEventListener("input", refresh);
      const actions = element("div", "app-toolbar");
      actions.append(filter, toolbarButton("Close Help", () => {
        closeWindow(reference.id);
        if (openWindows.get(studio.id) === studio) focusWindow(studio);
      }));
      reference.body.replaceChildren(actions, list);
      refresh();
    }});
  win.body.querySelector("input")?.focus();
}
