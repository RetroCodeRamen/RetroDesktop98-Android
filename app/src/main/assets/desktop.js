"use strict";

const native = window.AndroidDesktop;
const desktop = document.getElementById("desktop");
const grid = document.getElementById("desktop-grid");
const layer = document.getElementById("windows");
const transient = document.getElementById("transient");
const tasks = document.getElementById("tasks");
const startButton = document.getElementById("start");
const clock = document.getElementById("clock");
const openWindows = new Map();
const placements = new Map();
const colors = {
  Teal: "#008080", Blue: "#3a6ea5", Navy: "#000080", Slate: "#56606d",
  Plum: "#694468", Green: "#286047", Black: "#101010"
};
const initialItems = [
  ["computer", "My Computer"], ["documents", "My Documents"],
  ["network", "Network Neighborhood"], ["recycle", "Recycle Bin"],
  ["settings", "Control Panel"], ["browser", "Internet Explorer"]
].map(([target, name], row) => ({
  id: target, type: "system", target, name, parent: null, col: 0, row
}));
const state = loadState();
let installed = new Map();
let appsLoaded = false;
let activeWindow = null;
let selected = null;
let menu = null;
let zCounter = 0;
let noticeTimer = 0;
let counter = 0;
let drag = null;
let suppressedClick = null;
let tap = null;
let showDesktopWindows = [];
let homeSetupShown = false;
let currentOrientation = screenOrientation();

function loadState() {
  try {
    const raw = native ? native.loadState() : localStorage.getItem("retro-desktop-98");
    const saved = JSON.parse(raw || "null");
    if (saved && Array.isArray(saved.items)) {
      return {
        items: saved.items,
        color: Object.prototype.hasOwnProperty.call(colors, saved.color) ? saved.color : "Teal",
        doubleTap: saved.doubleTap === true,
        ...displaySettings(saved),
        ...shellSettings(saved),
        layouts: validWindowLayouts(saved.layouts)
      };
    }
  } catch (error) {
    console.warn("Could not load the desktop layout", error);
  }
  return {items: initialItems.map(item => ({...item})), color: "Teal", doubleTap: false, ...displaySettings({}), ...shellSettings({}), layouts: {}};
}

function saveState() {
  const serialized = JSON.stringify(state);
  if (native) native.saveState(serialized);
  else localStorage.setItem("retro-desktop-98", serialized);
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function button(value, action, className = "bevel action") {
  const node = element("button", className, value);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function itemById(id) {
  return state.items.find(item => item.id === id);
}

function children(parent) {
  return state.items.filter(item => item.parent === parent && !item.removed);
}

function isTrashed(item) {
  if (!item) return false;
  if (item.removed) return true;
  return item.parent != null && isTrashed(itemById(item.parent));
}

function itemImage(item, size) {
  if (item.type === "app") return retroIcon("app", size, installed.get(item.target)?.icon);
  if (item.type === "builtin") return retroIcon((DESKTOP_APPS.get(item.target) || luaPrograms.get(item.target))?.art
    || (isLuaProgramId(item.target) ? "lua" : "app"), size);
  if (item.type === "folder" || item.type === "workspace-folder") return retroIcon("folder", size);
  if (item.type === "workspace-file") return retroIcon("paper", size);
  if (item.type === "dosbox-game") return retroIcon("terminal", size);
  return retroIcon(systemIcon(item.target), size);
}

function systemIcon(target) {
  if (target === "computer" && ["science", "underwater"].includes(state.themePack)) return state.themePack + "Computer";
  if (target === "documents" && ["science", "underwater"].includes(state.themePack)) return state.themePack + "Documents";
  if (target === "recycle" && state.items.some(item => item.removed)) return "recycleFull";
  return target;
}

function announce(message) {
  const box = document.getElementById("notice");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { box.hidden = true; }, 2500);
}

function system(action, argument = "") {
  closeMenu();
  if (native) native.system(action, argument);
  else announce("Available in the Android launcher.");
}

function runApp(id) {
  closeMenu();
  if (native) native.launchApp(id);
  else announce(installed.get(id)?.name || "App unavailable");
}

function applyState() {
  saveState();
  renderLayout();
}

function renderLayout() {
  applyDisplaySettings();
  renderDesktop();
  updateQuickLaunch();
  renderActiveDesktop();
  for (const win of [...openWindows.values()]) {
    if (win.kind === "folder" && (!itemById(win.id) || isTrashed(itemById(win.id)))) closeWindow(win.id);
    else if (win.kind === "folder" || win.kind === "recycle") renderExplorer(win);
    win.refreshLuaDensity?.();
  }
  renderTasks();
}

function gridMetrics() {
  const styles = getComputedStyle(document.documentElement);
  const width = parseFloat(styles.getPropertyValue("--cell-width"));
  const height = parseFloat(styles.getPropertyValue("--cell-height"));
  const offset = 7;
  return {
    width, height, offset,
    rows: Math.max(1, Math.floor((desktop.clientHeight - offset) / height))
  };
}

function renderDesktop() {
  const desktopItems = children(null);
  const {width, height, offset, rows} = gridMetrics();
  const occupied = new Set();
  placements.clear();
  for (const item of desktopItems) {
    const {col, row} = item;
    const cell = col * rows + row;
    if (Number.isInteger(col) && col >= 0 && Number.isInteger(row) && row >= 0 &&
        row < rows && !occupied.has(cell)) {
      occupied.add(cell);
      placements.set(item.id, {col, row});
    }
  }
  let cursor = 0;
  let maxColumn = 0;
  grid.replaceChildren(...desktopItems.map(item => {
    if (!placements.has(item.id)) {
      while (occupied.has(cursor)) cursor++;
      occupied.add(cursor);
      placements.set(item.id, {col: Math.floor(cursor / rows), row: cursor % rows});
    }
    const {col, row} = placements.get(item.id);
    const tile = makeTile(item, null);
    tile.style.left = offset + col * width + "px";
    tile.style.top = offset + row * height + "px";
    maxColumn = Math.max(maxColumn, col);
    return tile;
  }));
  grid.style.width = offset + (maxColumn + 1) * width + "px";
}

function makeTile(item, scope) {
  const bin = scope === "$recycle";
  const isDesktop = scope === null;
  const node = button(null, event => {
    if (suppressedClick?.id === item.id && Date.now() < suppressedClick.until) return;
    selectItem(item.id, scope);
    if (bin) return;
    const mouse = event.pointerType === "mouse" || (event.detail && !event.pointerType &&
      matchMedia("(pointer: fine)").matches);
    const doubleTap = event.pointerType === "touch" && state.doubleTap && isDesktop;
    const previousTap = tap;
    tap = {id: item.id, scope, time: Date.now()};
    if (event.detail === 0 || (!mouse && !doubleTap) || event.detail === 2 ||
        (doubleTap && previousTap?.id === item.id && previousTap.scope === scope &&
          tap.time - previousTap.time < 450)) {
      tap = null;
      openItem(item);
    }
  }, "tile " + (isDesktop ? "desktop-icon" : "explorer-icon"));
  node.dataset.item = item.id;
  node.dataset.scope = scope || "";
  node.setAttribute("aria-selected", String(selected?.id === item.id && selected.scope === scope));
  node.title = item.name;
  const picture = element("span", "icon-picture");
  picture.append(itemImage(item, isDesktop ? 40 : 34));
  if (item.type === "app" || item.type === "builtin" || workspaceShortcutType(item.type)) {
    const arrow = retroIcon("arrow", 22);
    arrow.classList.add("shortcut-arrow");
    picture.append(arrow);
  }
  node.append(picture, element("span", "tile-label", item.name));
  node.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    selectItem(item.id, scope);
    showItemMenu(item, scope, event.clientX, event.clientY);
  });
  node.addEventListener("pointerdown", event => startTileGesture(event, node, item, scope));
  return node;
}

function selectItem(id, scope) {
  selected = id ? {id, scope} : null;
  for (const node of document.querySelectorAll(".tile[data-item]")) {
    node.setAttribute("aria-selected", String(node.dataset.item === id && node.dataset.scope === (scope || "")));
  }
}

function openItem(item) {
  closeMenu();
  if (item.type === "builtin") {
    const app = DESKTOP_APPS.get(item.target) || luaPrograms.get(item.target);
    if (app) openProgram(app);
    else if (isLuaProgramId(item.target)) announce("This Lua program is unavailable. Add it from Lua Studio.");
    return;
  }
  if (item.type === "app") {
    if (installed.has(item.target)) runApp(item.target);
    else announce(appsLoaded ? "This app is currently unavailable." : "Still loading programs…");
    return;
  }
  if (item.type === "folder") {
    openWindow("folder", item.id);
    return;
  }
  if (workspaceShortcutType(item.type)) {
    if (!validWorkspaceShortcut(item.target)) return;
    if (item.type === "dosbox-game") playWorkspaceDosGame(item.target);
    else {
      if (item.type === "workspace-folder") openWindow("files");
      fileCommand("open-catalog", item.target);
    }
    return;
  }
  switch (item.target) {
    case "computer": openWindow("computer"); break;
    case "documents": openFileLocation("documents"); break;
    case "recycle": openWindow("recycle"); break;
    case "browser": openWindow("browser"); break;
    default: system(item.target);
  }
}

function createItem(type, name, parent, target = "") {
  const item = {id: Date.now().toString(36) + "-" + (++counter).toString(36), type, name, parent, target};
  state.items.push(item);
  applyState();
  selectItem(item.id, parent);
  return item;
}

function pinApp(app, parent) {
  const type = app.builtin ? "builtin" : "app";
  const previous = children(parent).find(item => item.target === app.id
    && (item.type === type || (app.id === "browser" && item.type === "system")));
  if (!previous) createItem(type, app.name, parent, app.id);
  else selectItem(previous.id, parent);
  announce(previous ? "This shortcut is already here." : (parent ? "Shortcut added." : "Shortcut added to Desktop."));
}

function newFolder(parent) {
  let name = "New Folder";
  for (let suffix = 2; children(parent).some(item => item.name === name); suffix++) name = "New Folder (" + suffix + ")";
  nameDialog("New Folder", name, value => createItem("folder", value, parent));
}

function canNest(item, folder) {
  if (!folder || folder.type !== "folder" || isTrashed(folder) || item.target === "recycle") return false;
  for (let ancestor = folder; ancestor; ancestor = itemById(ancestor.parent)) {
    if (ancestor.id === item.id) return false;
  }
  return true;
}

function moveItem(item, parent, cell) {
  if (parent && !canNest(item, itemById(parent))) return;
  item.parent = parent;
  delete item.col;
  delete item.row;
  if (cell) {
    item.col = cell.col;
    item.row = cell.row;
  }
  applyState();
  selectItem(item.id, parent);
}

function trashItem(item) {
  if (item.target === "recycle") return;
  item.removed = true;
  selectItem(null, null);
  applyState();
  announce("Moved to Recycle Bin.");
}

function restoreItem(item) {
  if (item.parent && (!itemById(item.parent) || isTrashed(itemById(item.parent)))) {
    item.parent = null;
    delete item.col;
    delete item.row;
  }
  delete item.removed;
  applyState();
  announce("Shortcut restored.");
}

function emptyBin() {
  if (!state.items.some(item => item.removed)) return;
  dialog({
    kind: "empty",
    title: "Confirm Empty Recycle Bin",
    icon: "recycleFull",
    message: "Permanently delete the shortcuts and folders in the Recycle Bin?",
    accept: "Yes",
    cancel: "No",
    onAccept: () => {
      state.items = state.items.filter(item => !isTrashed(item));
      applyState();
    }
  });
}

function showItemMenu(item, scope, x, y) {
  if (scope === "$recycle") {
    showMenu([["Restore", "recycle", () => restoreItem(item)]], x, y);
    return;
  }
  const entries = [["Open", "", () => openItem(item)]];
  const program = DESKTOP_APPS.get(item.target) || luaPrograms.get(item.target) || installed.get(item.target);
  if (program) entries.push(quickLaunchCommand(program));
  if (item.type === "app") entries.push(["App Info", "settings", () => native?.appInfo(item.target)]);
  if (item.target === "recycle") {
    entries.push(["Empty Recycle Bin", "recycle", emptyBin, !state.items.some(child => child.removed)]);
  } else {
    entries.push(null, ["Rename…", "", () => nameDialog("Rename", item.name, value => {
      item.name = value;
      const win = openWindows.get(item.id);
      if (win) {
        win.title = value;
        win.titleLabel.textContent = value;
      }
      applyState();
    })]);
    const folders = state.items.filter(folder => canNest(item, folder) && folder.id !== item.parent);
    if (folders.length) entries.push(["Move to Folder…", "folder", () => folderDialog(folders, folder => moveItem(item, folder.id))]);
    if (scope) entries.push(["Move to Desktop", "desktop", () => moveItem(item, null)]);
    entries.push(["Delete", "recycle", () => trashItem(item)]);
  }
  showMenu(entries, x, y);
}

function showDesktopMenu(x, y) {
  selectItem(null, null);
  showMenu([
    ["New Folder…", "folder", () => newFolder(null)],
    ["Add App Shortcut…", "programs", () => openPrograms({pin: true})],
    null,
    ["Arrange Icons by Name", "", () => arrangeDesktop()],
    ["Active Desktop…", "desktop", () => openWindow("channels")],
    ["Properties", "settings", () => openWindow("display")]
  ], x, y);
}

function arrangeDesktop() {
  const items = children(null).sort((a, b) => a.name.localeCompare(b.name));
  for (const item of items) {
    delete item.col;
    delete item.row;
  }
  state.items = [...items, ...state.items.filter(item => !items.includes(item))];
  applyState();
}

function startTileGesture(event, node, item, scope) {
  if (event.button !== 0 || drag) return;
  const {clientX: x, clientY: y, pointerId} = event;
  const gesture = {node, item, scope, x, y, pointerId, context: false};
  drag = gesture;
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    gesture.timer = setTimeout(() => {
      gesture.context = true;
      selectItem(item.id, scope);
      showItemMenu(item, scope, x, y);
      suppressedClick = {id: item.id, until: Date.now() + 500};
    }, 530);
  }
}

function moveTileGesture(event) {
  if (!drag || drag.pointerId !== event.pointerId || drag.scope === "$recycle") return;
  const {clientX: x, clientY: y} = event;
  if (!drag.ghost) {
    if (Math.hypot(x - drag.x, y - drag.y) < (drag.context ? 16 : 8)) return;
    clearTimeout(drag.timer);
    drag.context = false;
    closeMenu();
    selectItem(drag.item.id, drag.scope);
    drag.node.classList.add("dragging");
    drag.ghost = itemImage(drag.item, 40);
    drag.ghost.classList.add("drag-ghost");
    document.body.append(drag.ghost);
  }
  event.preventDefault();
  drag.ghost.style.left = x + "px";
  drag.ghost.style.top = y + "px";
  updateDropTarget(x, y);
}

function updateDropTarget(x, y) {
  const under = document.elementFromPoint(x, y);
  const candidate = under?.closest(".tile[data-item]");
  drag.highlight?.classList.remove("drop-target");
  drag.highlight = null;
  if (!candidate || candidate === drag.node) return;
  const target = itemById(candidate.dataset.item);
  if (canNest(drag.item, target) || (target?.target === "recycle" && drag.item.target !== "recycle")) {
    candidate.classList.add("drop-target");
    drag.highlight = candidate;
  }
}

function endTileGesture(event, cancelled = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const gesture = drag;
  drag = null;
  clearTimeout(gesture.timer);
  if (!gesture.ghost) {
    if (gesture.context) suppressedClick = {id: gesture.item.id, until: Date.now() + 350};
    return;
  }
  gesture.ghost.remove();
  gesture.node.classList.remove("dragging");
  gesture.highlight?.classList.remove("drop-target");
  suppressedClick = {id: gesture.item.id, until: Date.now() + 350};
  if (!cancelled) dropItem(gesture.item, gesture.scope, event.clientX, event.clientY);
}

function dropItem(item, scope, x, y) {
  const under = document.elementFromPoint(x, y);
  const tile = under?.closest(".tile[data-item]");
  const target = tile && itemById(tile.dataset.item);
  if (target?.id === item.id) return;
  if (target?.target === "recycle") {
    trashItem(item);
    return;
  }
  if (canNest(item, target)) {
    moveItem(item, target.id);
    return;
  }
  const folderWindow = under?.closest(".explorer[data-folder]");
  if (folderWindow && canNest(item, itemById(folderWindow.dataset.folder))) {
    moveItem(item, folderWindow.dataset.folder);
    return;
  }
  if (!desktop.contains(under)) return;
  const {width, height, offset, rows} = gridMetrics();
  const bounds = desktop.getBoundingClientRect();
  const col = Math.max(0, Math.floor((x - bounds.left + desktop.scrollLeft - offset) / width));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y - bounds.top - offset) / height)));
  if (target && scope === null && placements.has(item.id)) {
    Object.assign(target, placements.get(item.id));
  }
  moveItem(item, null, {col, row});
}

function closeMenu() {
  if (!menu) return;
  if (menu.anchor) menu.anchor.setAttribute("aria-expanded", "false");
  if (menu.subAnchor) menu.subAnchor.setAttribute("aria-expanded", "false");
  transient.replaceChildren();
  menu = null;
  syncBrowserPosition();
}

function menuItems(container, entries) {
  for (const entry of entries) {
    if (!entry) {
      container.append(element("div", "rule"));
      continue;
    }
    const [label, icon, action, disabled] = entry;
    const row = button(null, () => {
      closeMenu();
      action();
    }, "menu-item");
    row.setAttribute("role", "menuitem");
    row.disabled = Boolean(disabled);
    if (icon) row.append(retroIcon(icon, 20));
    row.append(element("span", "", label));
    container.append(row);
  }
}

function positionMenu(panel, x, y) {
  panel.style.left = Math.min(Math.max(4, x), Math.max(4, innerWidth - panel.offsetWidth - 4)) + "px";
  panel.style.top = Math.min(Math.max(4, y), Math.max(4, innerHeight - panel.offsetHeight - 4)) + "px";
}

function showMenu(entries, x, y, anchor = null) {
  closeMenu();
  const panel = element("div", "popup bevel");
  panel.setAttribute("role", "menu");
  menuItems(panel, entries);
  transient.append(panel);
  positionMenu(panel, x, y);
  menu = {panel, anchor};
  anchor?.setAttribute("aria-expanded", "true");
  syncBrowserPosition();
}

function startMenu() {
  if (menu?.anchor === startButton) {
    closeMenu();
    return;
  }
  closeMenu();
  const panel = element("div", "popup start-menu bevel");
  const rail = element("div", "start-rail");
  rail.setAttribute("aria-hidden", "true");
  const wordmark = element("span", "", "Windows");
  wordmark.append(element("em", "", "98"));
  rail.append(wordmark);
  const list = element("div", "start-items");
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", "Start menu");
  menuItems(list, [["Programs", "programs", () => openPrograms()]]);
  list.append(startCascadeButton("Documents", "documents", startDocuments),
    startCascadeButton("Settings", "settings", startSettings),
    startCascadeButton("Find", "find", anchor => startCascade(anchor, [
      ["Files or Folders…", "find", () => openWindow("find-files", "$find-files", {focus: true})],
      ["Programs…", "programs", () => openPrograms({focus: true})]
    ])));
  menuItems(list, [
    ["Run…", "run", () => openWindow("run", "$run", {focus: true})],
    null, ["Shut Down…", "shutdown", () => openWindow("power")]
  ]);
  panel.append(rail, list);
  transient.append(panel);
  startButton.setAttribute("aria-expanded", "true");
  menu = {panel, anchor: startButton};
  syncBrowserPosition();
}

function startSettings(anchor) {
  startCascade(anchor, [
    ["Control Panel", "settings", () => system("settings")],
    ["Display Properties", "desktop", () => openWindow("display")],
    ["Active Desktop…", "desktop", () => openWindow("channels")],
    ["Desktop Backup…", "folder", () => openWindow("backup")],
    null,
    ["Wi-Fi", "network", () => system("wifi")],
    ["Bluetooth", "", () => system("bluetooth")],
    ["Apps", "programs", () => system("apps")],
    ["Home App…", "desktop", () => system("home")]
  ]);
}

function openPrograms(options = {}) {
  openWindow("programs", "$programs", options);
}

function windowSpec(kind, id, options) {
  const app = DESKTOP_APPS.get(kind);
  if (app) return [app.name, app.art, app.width, app.height];
  switch (kind) {
    case "folder": return [itemById(id).name, "folder", 365, 322];
    case "computer": return ["My Computer", "computer", 365, 302];
    case "recycle": return ["Recycle Bin", systemIcon("recycle"), 357, 315];
    case "programs": return [options.pin ? "Add App Shortcut" : "Programs", "programs", 415, 498];
    case "run": return ["Run", "run", 378, 225];
    case "display": return ["Display Properties", "desktop", 460, 490];
    case "find-files": return ["Find: Files or Folders", "find", 540, 392];
    case "power": return ["Shut Down Windows", "shutdown", 365, 252];
    case "channels": return ["Active Desktop", "desktop", 360, 220];
    case "terminal-connect": return ["Connect to", "terminal", 382, 482];
    case "lua-preview": return [options.form.caption, "lua", options.form.width + 22, options.form.height + (options.form.menus.length ? 107 : 84)];
    case "backup": return ["Desktop Backup", "folder", 388, 230];
    default: return [options.title, options.icon, 365, options.height || 215];
  }
}

function windowButton(name, icon, action) {
  const node = button(null, action, "bevel");
  node.title = name;
  node.setAttribute("aria-label", name);
  node.append(element("span", "window-symbol " + icon));
  return node;
}

function openWindow(kind, id = "$" + kind, options = {}) {
  const [title, icon, width, height] = windowSpec(kind, id, options);
  let win = openWindows.get(id);
  if (win) {
    if (kind === "programs") {
      win.options = options;
      win.title = title;
      win.titleLabel.textContent = title;
      renderPrograms(win);
    }
    win.minimized = false;
    focusWindow(win);
    if (kind === "browser" && options.address) navigateBrowser(win, options.address);
    if (options.focus) win.body.querySelector("input")?.focus();
    return win;
  }
  const node = element("section", "window");
  node.setAttribute("role", "region");
  const bar = element("div", "titlebar");
  const iconNode = retroIcon(icon, 17);
  const titleLabel = element("span", "title-text", title);
  titleLabel.id = "title-" + id.replace("$", "");
  node.setAttribute("aria-labelledby", titleLabel.id);
  const controls = element("div", "title-controls");
  const body = element("div", "window-content");
  win = {
    id, kind, title, icon, iconNode, titleLabel, options, node, body, width, height,
    baseWidth: width, baseHeight: height, minimized: false, maximized: false, list: false, query: "", offset: openWindows.size % 4 * 15
  };
  controls.append(windowButton("Minimize", "minimize", () => minimizeWindow(id)));
  win.maxButton = windowButton("Maximize", "maximize", () => maximizeWindow(win));
  controls.append(win.maxButton, windowButton("Close", "close", () => closeWindow(id)));
  bar.append(iconNode, titleLabel, controls);
  node.append(bar, body);
  for (const direction of ["n", "e", "s", "w", "nw", "ne", "sw", "se"]) {
    const handle = element("div", "window-resize resize-" + direction);
    handle.setAttribute("aria-hidden", "true");
    if (direction === "se") handle.title = "Drag to resize";
    handle.addEventListener("pointerdown", event => resizeWindow(event, win, direction));
    node.append(handle);
  }
  node.addEventListener("pointerdown", () => {
    if (activeWindow !== id) focusWindow(win);
  });
  bar.addEventListener("pointerdown", event => dragWindow(event, win));
  bar.addEventListener("dblclick", event => {
    if (!event.target.closest("button")) maximizeWindow(win);
  });
  openWindows.set(id, win);
  layer.append(node);
  if (kind === "programs") renderPrograms(win);
  else if (kind === "run") renderRun(win);
  else if (kind === "display") renderDisplay(win);
  else if (kind === "backup") renderDesktopBackup(win);
  else if (kind === "find-files") renderFindFiles(win);
  else if (kind === "power") renderPowerDialog(win);
  else if (kind === "channels") renderChannelSettings(win);
  else if (kind === "terminal-connect") renderTerminalConnect(win);
  else if (kind === "lua-preview") renderLuaPreview(win);
  else if (kind === "lua-reference") options.render(win);
  else if (options.dialog) renderDialog(win);
  else if (DESKTOP_APPS.has(kind)) DESKTOP_APPS.get(kind).render(win);
  else renderExplorer(win);
  restoreWindowLayout(win);
  placeWindow(win);
  focusWindow(win);
  if (options.focus) body.querySelector("input")?.focus();
  return win;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function placeWindow(win) {
  const areaWidth = layer.clientWidth;
  const areaHeight = layer.clientHeight;
  const width = win.maximized ? areaWidth : Math.min(win.width, Math.max(1, areaWidth - 10));
  const height = win.maximized ? areaHeight : Math.min(win.height, Math.max(1, areaHeight - 10));
  const centerX = (areaWidth - width) / 2 + win.offset;
  const centerY = Math.min(66 + win.offset, (areaHeight - height) / 2);
  const x = win.maximized ? 0 : clamp(win.x ?? centerX, 5, areaWidth - width - 5);
  const y = win.maximized ? 0 : clamp(win.y ?? centerY, 5, areaHeight - height - 5);
  Object.assign(win.node.style, {
    left: x + "px", top: y + "px", width: Math.max(1, width) + "px", height: Math.max(1, height) + "px"
  });
  if (win.kind === "browser" || win.kind === "dosbox") syncBrowserPosition();
}

function trackWindowPointer(event, update, commit) {
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  let moved = false;
  const orientation = currentOrientation;
  const move = next => {
    if (next.pointerId !== event.pointerId || orientation !== currentOrientation) return;
    moved = true;
    update(next.clientX - event.clientX, next.clientY - event.clientY);
  };
  const end = next => {
    if (next.pointerId !== event.pointerId) return;
    target.removeEventListener("pointermove", move);
    target.removeEventListener("lostpointercapture", end);
    if (moved && orientation === currentOrientation) commit();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("lostpointercapture", end);
}

function dragWindow(event, win) {
  if (win.maximized || event.button !== 0 || !event.isPrimary || event.target.closest("button")) return;
  const left = win.node.offsetLeft;
  const top = win.node.offsetTop;
  trackWindowPointer(event, (dx, dy) => {
    win.x = left + dx;
    win.y = top + dy;
    placeWindow(win);
  }, () => rememberWindowLayout(win));
}

function resizeWindow(event, win, direction) {
  if (win.maximized || event.button !== 0 || !event.isPrimary) return;
  const startLeft = win.node.offsetLeft;
  const startTop = win.node.offsetTop;
  const startRight = startLeft + win.node.offsetWidth;
  const startBottom = startTop + win.node.offsetHeight;
  const west = direction.includes("w");
  const east = direction.includes("e");
  const north = direction.includes("n");
  const south = direction.includes("s");
  trackWindowPointer(event, (dx, dy) => {
    if (win.maximized) return;
    const rightLimit = layer.clientWidth - 5;
    const bottomLimit = layer.clientHeight - 5;
    const left = west ? clamp(startLeft + dx, 5, Math.max(5, startRight - 204)) : startLeft;
    const top = north ? clamp(startTop + dy, 5, Math.max(5, startBottom - 164)) : startTop;
    const right = east ? clamp(startRight + dx, Math.min(startLeft + 204, rightLimit), rightLimit) : startRight;
    const bottom = south ? clamp(startBottom + dy, Math.min(startTop + 164, bottomLimit), bottomLimit) : startBottom;
    if (west || east) {
      win.x = left;
      win.width = Math.max(1, right - left);
    }
    if (north || south) {
      win.y = top;
      win.height = Math.max(1, bottom - top);
    }
    placeWindow(win);
  }, () => rememberWindowLayout(win));
}

function focusWindow(win) {
  const changed = win.id !== activeWindow;
  activeWindow = win.id;
  win.z = ++zCounter;
  win.node.style.zIndex = win.z;
  refreshWindowFocus();
  if (changed) win.onFocus?.();
}

function focusTopWindow() {
  const top = [...openWindows.values()].filter(win => !win.minimized).sort((a, b) => b.z - a.z)[0];
  const changed = activeWindow !== top?.id;
  activeWindow = top?.id ?? null;
  refreshWindowFocus();
  if (changed) top?.onFocus?.();
}

function refreshWindowFocus() {
  for (const win of openWindows.values()) {
    win.node.hidden = win.minimized;
    win.node.classList.toggle("inactive", win.id !== activeWindow);
  }
  renderTasks();
  syncBrowserPosition();
  syncAudioMeter();
}

function minimizeWindow(id) {
  closeMenu();
  const win = openWindows.get(id);
  if (!win) return;
  win.node.querySelector(":focus")?.blur();
  win.minimized = true;
  focusTopWindow();
}

function maximizeWindow(win) {
  closeMenu();
  if (!win.maximized && canRememberLayout(win)) {
    win.x = win.node.offsetLeft;
    win.y = win.node.offsetTop;
  }
  setWindowMaximized(win, !win.maximized);
  placeWindow(win);
  rememberWindowLayout(win);
}

function setWindowMaximized(win, maximized) {
  win.maximized = maximized;
  win.node.classList.toggle("maximized", win.maximized);
  const label = win.maximized ? "Restore down" : "Maximize";
  win.maxButton.title = label;
  win.maxButton.setAttribute("aria-label", label);
  win.maxButton.firstChild.className = "window-symbol " + (win.maximized ? "restore" : "maximize");
}

function closeWindow(id, discard = false) {
  closeMenu();
  const win = openWindows.get(id);
  if (!win) return;
  if (!discard && win.beforeClose && !win.beforeClose()) return;
  win.cleanup?.();
  if (win.kind === "browser") native?.browserCommand?.("close", "");
  win.node.remove();
  openWindows.delete(id);
  if (selected?.scope === id || (id === "$recycle" && selected?.scope === "$recycle")) selectItem(null, null);
  focusTopWindow();
}

function renderTasks() {
  tasks.replaceChildren(...[...openWindows.values()].map(win => {
    const task = button(null, () => {
      if (win.id === activeWindow && !win.minimized) minimizeWindow(win.id);
      else {
        win.minimized = false;
        focusWindow(win);
      }
    }, "bevel");
    task.title = win.title;
    task.setAttribute("aria-pressed", String(activeWindow === win.id));
    task.append(retroIcon(win.icon, 16), element("span", "", win.title));
    return task;
  }));
}

function showDesktop(restore) {
  closeMenu();
  const visible = [...openWindows.values()].filter(win => !win.minimized);
  if (!visible.length && restore) {
    for (const id of showDesktopWindows) {
      const win = openWindows.get(id);
      if (win) win.minimized = false;
    }
    showDesktopWindows = [];
  } else {
    showDesktopWindows = visible.map(win => win.id);
    visible.forEach(win => {
      win.node.querySelector(":focus")?.blur();
      win.minimized = true;
    });
  }
  focusTopWindow();
}

function windowMenu(label, actions) {
  const node = button(label, () => {
    if (menu?.anchor === node) {
      closeMenu();
      return;
    }
    const bounds = node.getBoundingClientRect();
    showMenu(actions, bounds.left, bounds.bottom, node);
  }, "");
  node.setAttribute("aria-expanded", "false");
  node.setAttribute("aria-haspopup", "true");
  return node;
}

function objectCount(count) {
  return count + (count === 1 ? " object" : " objects");
}

function renderExplorer(win) {
  const menuBar = element("nav", "window-menubar");
  const surface = element("div", "explorer " + (win.list ? "explorer-list" : "explorer-grid"));
  const status = element("div", "explorer-status");
  let actions = [];
  let objects = [];
  switch (win.kind) {
    case "folder":
      surface.dataset.folder = win.id;
      objects = children(win.id).map(item => makeTile(item, win.id));
      actions = [
        ["New Folder…", "folder", () => newFolder(win.id)],
        ["Add App Shortcut…", "programs", () => openPrograms({pin: true, parent: win.id})],
        null
      ];
      surface.addEventListener("contextmenu", event => {
        event.preventDefault();
        if (event.target.closest(".tile")) return;
        showMenu(actions.slice(0, 2), event.clientX, event.clientY);
      });
      break;
    case "recycle": {
      const removed = state.items.filter(item => item.removed);
      objects = removed.map(item => makeTile(item, "$recycle"));
      win.icon = systemIcon("recycle");
      const nextIcon = retroIcon(win.icon, 17);
      win.iconNode.replaceWith(nextIcon);
      win.iconNode = nextIcon;
      actions = [
        ["Restore", "recycle", () => {
          const current = selected?.scope === "$recycle" && itemById(selected.id);
          if (current?.removed) restoreItem(current);
          else announce("Select a shortcut to restore.");
        }],
        ["Empty Recycle Bin…", "recycleFull", emptyBin, !removed.length],
        null
      ];
      break;
    }
    case "computer":
      objects = [
        systemTile("Local Disk (C:)", "disk", () => openFileLocation("home")),
        systemTile("My Documents", "documents", () => openFileLocation("documents")),
        systemTile("Control Panel", "settings", () => system("settings")),
        systemTile("Network", "network", () => system("network")),
        systemTile("About Phone", "computer", () => system("about"))
      ];
      status.textContent = native?.availableStorage() || objectCount(objects.length);
      break;
  }
  actions.push(["Close", "", () => closeWindow(win.id)]);
  menuBar.append(
    windowMenu("File", actions),
    windowMenu("View", [
      ["Large Icons", "", () => { win.list = false; renderExplorer(win); }],
      ["List", "", () => { win.list = true; renderExplorer(win); }]
    ])
  );
  if (objects.length) surface.append(...objects);
  else surface.append(element("div", "empty-note", win.kind === "recycle" ? "Recycle Bin is empty." : "This folder is empty."));
  if (!status.textContent) status.textContent = objectCount(objects.length);
  win.body.replaceChildren(menuBar, surface, status);
}

function systemTile(label, icon, action) {
  const node = button(null, action, "tile explorer-icon");
  node.append(retroIcon(icon, 34), element("span", "tile-label", label));
  return node;
}

function programMenu(app, anchor, x, y) {
  const entries = [
    ["Open", "", () => openProgram(app)],
    ["Send to Desktop (create shortcut)", "desktop", () => pinApp(app, null)],
    quickLaunchCommand(app)
  ];
  const folders = state.items.filter(folder => folder.type === "folder" && !isTrashed(folder));
  if (folders.length) entries.push(["Add to Folder…", "folder", () => folderDialog(folders, folder => pinApp(app, folder.id))]);
  if (app.published) {
    entries.push(null, ["Edit in Lua Studio", "lua", () => editPublishedLua(app)],
      ["Remove from Programs…", "recycle", () => removePublishedLua(app)]);
  } else if (!app.builtin) entries.push(null, ["App Info", "settings", () => native?.appInfo(app.id)]);
  const bounds = anchor?.getBoundingClientRect();
  showMenu(entries, x ?? bounds?.left, y ?? bounds?.bottom, anchor);
}

function openProgram(app) {
  if (app.published) startPublishedLua(app);
  else if (app.builtin) openWindow(app.id);
  else runApp(app.id);
}

function renderPrograms(win) {
  const toolbar = element("div", "explorer-toolbar");
  const search = element("input", "text-entry");
  search.id = "program-search";
  search.type = "search";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.value = win.query;
  const label = element("label", "", "Find:");
  label.htmlFor = search.id;
  toolbar.append(label, search);
  const surface = element("div", "explorer");
  const status = element("div", "explorer-status");
  win.programSurface = surface;
  win.programStatus = status;
  search.addEventListener("input", () => {
    win.query = search.value;
    renderProgramRows(win);
  });
  search.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    win.programSurface.querySelector(".program-open")?.click();
  });
  win.body.replaceChildren(toolbar, surface, status);
  renderProgramRows(win);
}

function renderProgramRows(win) {
  const query = win.query.trim().toLocaleLowerCase();
  const filtered = [...DESKTOP_APPS.values(), ...luaPrograms.values(), ...installed.values()]
    .filter(app => app.name.toLocaleLowerCase().includes(query));
  let group = "";
  const content = [];
  const rows = filtered.map(app => {
    const row = element("div", "program-row");
    const open = button(null, () => {
      if (!win.options.pin) {
        win.body.querySelector("input")?.blur();
        openProgram(app);
        return;
      }
      const parent = win.options.parent;
      const folder = itemById(parent);
      if (parent && (!folder || isTrashed(folder))) {
        announce("That folder is no longer available.");
        return;
      }
      pinApp(app, parent ?? null);
    }, "program-open");
    open.append(retroIcon(app.art || "app", 26, app.icon), element("span", "", app.name));
    open.title = app.name;
    const more = button("…", () => {
      if (menu?.anchor === more) closeMenu();
      else programMenu(app, more);
    }, "bevel program-more");
    more.setAttribute("aria-label", "Options for " + app.name);
    more.setAttribute("aria-haspopup", "true");
    more.setAttribute("aria-expanded", "false");
    row.addEventListener("contextmenu", event => {
      event.preventDefault();
      programMenu(app, null, event.clientX, event.clientY);
    });
    row.append(open, more);
    return row;
  });
  if (!rows.length) rows.push(element("div", "empty-note", appsLoaded ? "No matching programs." : "Loading programs…"));
  rows.forEach((row, index) => {
    const category = filtered[index]?.group || "Android Apps";
    if (filtered[index] && category !== group) {
      group = category;
      content.push(element("div", "program-group", category));
    }
    content.push(row);
  });
  win.programSurface.replaceChildren(...content);
  const count = filtered.length + (filtered.length === 1 ? " program" : " programs");
  win.programStatus.textContent = count + (win.options.pin ? " · Select a program to add" : "");
}

function formActions(form, primary, secondary, cancel, extra) {
  const actions = element("div", "form-actions");
  const submit = element("button", "bevel action", primary);
  submit.type = "submit";
  actions.append(submit, button(secondary, cancel));
  if (extra) actions.append(extra);
  form.append(actions);
}

function renderRun(win) {
  const form = element("form", "window-form");
  const intro = element("div", "dialog-top");
  intro.append(retroIcon("run", 33), element("p", "", "Type an app name, a web address, or a command such as control, explorer, or wifi."));
  const label = element("label", "form-label", "Open:");
  const input = element("input", "text-entry");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.enterKeyHint = "go";
  const error = element("p", "form-error");
  error.setAttribute("role", "alert");
  label.append(input);
  form.append(intro, label);
  formActions(form, "OK", "Cancel", () => closeWindow(win.id), button("Browse…", () => system("document")));
  form.append(error);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const raw = input.value.trim();
    const command = raw.toLocaleLowerCase();
    const commands = new Map([
      ["control", "settings"], ["control.exe", "settings"], ["settings", "settings"],
      ["wifi", "wifi"], ["bluetooth", "bluetooth"], ["calendar", "calendar"], ["home", "home"]
    ]);
    const shortcuts = {calc: "calculator", "calc.exe": "calculator", "notepad.exe": "notepad",
      lua: "lua-studio", music: "music", winamp: "music", write: "wordpad", "write.exe": "wordpad",
      command: "dos", "command.com": "dos", cmd: "dos", ansiview: "ansi-viewer", dosbox: "dosbox", dosstore: "dos-store",
      hypertrm: "terminal", "hypertrm.exe": "terminal", charmap: "charmap", "charmap.exe": "charmap",
      sndrec32: "recorder", "sndrec32.exe": "recorder", mspaint: "paint", "mspaint.exe": "paint", explorer: "files", "explorer.exe": "files", iexplore: "browser", winmine: "mines", sol: "solitaire"};
    const app = [...DESKTOP_APPS.values(), ...luaPrograms.values(), ...installed.values()]
      .find(app => app.name.toLocaleLowerCase() === command || app.id === raw)
      || DESKTOP_APPS.get(shortcuts[command]);
    if (commands.has(command)) system(commands.get(command));
    else if (/^https?:\/\//i.test(raw)) openWindow("browser", "$browser", {address: raw});
    else if (app) openProgram(app);
    else {
      desktopSound("error");
      error.textContent = raw ? "Windows cannot find “" + raw + "”." : "Enter an app name, URL, or command.";
      input.focus();
      return;
    }
    closeWindow(win.id);
  });
  win.body.replaceChildren(form);
}

function dialog(options) {
  if (openWindows.has("$dialog")) closeWindow("$dialog");
  openWindow(options.kind, "$dialog", {...options, dialog: true, focus: Boolean(options.name)});
}

function nameDialog(title, initial, onAccept, maxLength = 70) {
  dialog({kind: "name", title, icon: "folder", name: initial, onAccept, maxLength, height: 180});
  openWindows.get("$dialog").body.querySelector("input")?.select();
}

function folderDialog(folders, onAccept) {
  dialog({kind: "choose", title: "Choose Folder", icon: "folder", folders, onAccept, height: 184});
}

function folderPath(folder) {
  const parent = itemById(folder.parent);
  return parent ? folderPath(parent) + " / " + folder.name : folder.name;
}

function renderDialog(win) {
  const options = win.options;
  const form = element("form", "window-form");
  let field = null;
  if (options.message) {
    const intro = element("div", "dialog-top");
    intro.append(retroIcon(options.icon, 34), element("p", "", options.message));
    form.append(intro);
  } else {
    const label = element("label", "form-label", options.folders ? "Destination:" : "Name:");
    if (options.folders) {
      field = element("select", "text-entry");
      options.folders.forEach(folder => field.add(new Option(folderPath(folder), folder.id)));
    } else {
      field = element("input", "text-entry");
      field.maxLength = options.maxLength || 70;
      field.value = options.name;
      field.required = true;
    }
    label.append(field);
    form.append(label);
  }
  formActions(form, options.accept || "OK", options.cancel || "Cancel", () => closeWindow(win.id));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const value = field?.value.trim();
    if (field && !value) {
      field.focus();
      return;
    }
    closeWindow(win.id);
    options.onAccept(options.folders ? itemById(value) : value);
  });
  win.body.replaceChildren(form);
}

function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  clock.title = now.toLocaleDateString([], {weekday: "long", year: "numeric", month: "long", day: "numeric"});
}

function desktopBack() {
  if (isDesktopAsleep()) { resumeDesktopSession(); return true; }
  if (stopScreenSaver()) return true;
  if (menu) closeMenu();
  else if (!document.getElementById("clippy-panel").hidden) setClippyVisible(false);
  else if (activeWindow) closeWindow(activeWindow);
  else if (selected) selectItem(null, null);
  else return false;
  return true;
}

window.desktopBack = desktopBack;
window.desktopHome = () => { if (isDesktopAsleep()) resumeDesktopSession(); stopScreenSaver(); setClippyVisible(false); showDesktop(false); selectItem(null, null); };
window.updateLauncherStatus = (active, preview) => {
  refreshLuaPrograms();
  const saved = loadState();
  if (JSON.stringify(saved) !== JSON.stringify(state)) {
    Object.assign(state, saved);
    renderLayout();
  }
  if (active && openWindows.has("$home-setup")) closeWindow("$home-setup");
  if (active || !preview || homeSetupShown) return;
  homeSetupShown = true;
  openWindow("home-setup", "$home-setup", {
    dialog: true,
    title: "Set as Home App",
    icon: "desktop",
    message: "Choose Retro Desktop 98 (Resizable) in Android’s Home app settings. Then press Home to open this desktop.",
    accept: "Open Settings",
    cancel: "Later",
    onAccept: () => system("home")
  });
};
window.setInstalledApps = apps => {
  installed = new Map(apps.map(app => [app.id, app]));
  appsLoaded = true;
  renderDesktop();
  updateQuickLaunch();
  for (const win of openWindows.values()) {
    if (win.kind === "programs") renderProgramRows(win);
    if (win.kind === "folder" || win.kind === "recycle") renderExplorer(win);
  }
};

initializeAudioTray();
initializeShellTray();
refreshLuaPrograms();
startButton.prepend(retroIcon("start", 23));
document.getElementById("show-desktop").append(retroIcon("desktop", 19));
document.getElementById("internet").append(retroIcon("browser", 19));
document.getElementById("network").append(retroIcon("network", 17));
document.getElementById("show-desktop").addEventListener("click", () => showDesktop(true));
document.getElementById("internet").addEventListener("click", () => openWindow("browser"));
document.getElementById("network").addEventListener("click", () => system("network"));
clock.addEventListener("click", () => system("calendar"));
clock.addEventListener("contextmenu", event => {
  event.preventDefault();
  showMenu([["Adjust Date/Time", "clock", () => system("date")]], event.clientX, event.clientY);
});
startButton.addEventListener("click", startMenu);
desktop.addEventListener("click", event => {
  if (!event.target.closest(".tile")) selectItem(null, null);
});
desktop.addEventListener("contextmenu", event => {
  event.preventDefault();
  if (!event.target.closest(".tile")) showDesktopMenu(event.clientX, event.clientY);
});

let desktopHold = null;
desktop.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch" || event.target.closest(".tile")) return;
  const {clientX: x, clientY: y, pointerId} = event;
  desktopHold = {x, y, pointerId, timer: setTimeout(() => showDesktopMenu(x, y), 540)};
});

document.addEventListener("pointerdown", event => {
  if (menu && !transient.contains(event.target) && !menu.anchor?.contains(event.target)) closeMenu();
}, true);
document.addEventListener("pointermove", event => {
  moveTileGesture(event);
  if (desktopHold && event.pointerId === desktopHold.pointerId &&
      Math.hypot(event.clientX - desktopHold.x, event.clientY - desktopHold.y) > 8) {
    clearTimeout(desktopHold.timer);
    desktopHold = null;
  }
});
for (const eventName of ["pointerup", "pointercancel"]) {
  document.addEventListener(eventName, event => {
    endTileGesture(event, eventName === "pointercancel");
    if (desktopHold?.pointerId === event.pointerId) {
      clearTimeout(desktopHold.timer);
      desktopHold = null;
    }
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && desktopBack()) event.preventDefault();
  if (event.target.matches("input, select, textarea")) return;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const bounds = document.activeElement.getBoundingClientRect();
    const item = selected && itemById(selected.id);
    if (item) showItemMenu(item, selected.scope, bounds.left, bounds.bottom);
    else showDesktopMenu(bounds.left, bounds.bottom);
  }
  if (event.key === "Delete" && selected && selected.scope !== "$recycle") {
    const item = itemById(selected.id);
    if (item) trashItem(item);
  }
});

window.addEventListener("resize", () => {
  closeMenu();
  renderDesktop();
  const orientation = screenOrientation();
  if (orientation !== currentOrientation) {
    currentOrientation = orientation;
    openWindows.forEach(restoreWindowLayout);
  }
  openWindows.forEach(placeWindow);
});
applyDisplaySettings();
updateClock();
setInterval(updateClock, 10000);
renderDesktop();
updateQuickLaunch();
renderActiveDesktop();
