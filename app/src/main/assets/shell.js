"use strict";

let recentDesktopFiles = [];
let activeTrackLabel;
let activeTrackToggle;
let sessionTimer = 0;

function shellSettings(saved) {
  const explorerView = ["list", "details", "web"].includes(saved.explorerView) ? saved.explorerView : "list";
  return {
    explorerView,
    luaDensity: ["auto", "compact", "standard"].includes(saved.luaDensity) ? saved.luaDensity : "auto",
    quickLaunch: Array.isArray(saved.quickLaunch) ? [...new Set(saved.quickLaunch.filter(id =>
      typeof id === "string" && id.length && id.length <= 512))].slice(0, 24) : [],
    channels: {search: saved.channels?.search === true, note: saved.channels?.note === true,
      music: saved.channels?.music === true}
  };
}

function startCascade(anchor, entries) {
  const same = menu.subAnchor === anchor;
  menu.sub?.remove();
  menu.subAnchor?.setAttribute("aria-expanded", "false");
  menu.sub = null;
  menu.subAnchor = null;
  if (same) return null;
  const sub = element("div", "popup submenu bevel");
  sub.setAttribute("role", "menu");
  sub.setAttribute("aria-label", anchor.textContent);
  menuItems(sub, entries);
  transient.append(sub);
  const bounds = menu.panel.getBoundingClientRect();
  const x = bounds.right + sub.offsetWidth < innerWidth ? bounds.right - 2 : innerWidth - sub.offsetWidth - 4;
  const y = Math.min(anchor.getBoundingClientRect().top, bounds.bottom - sub.offsetHeight);
  positionMenu(sub, x, y);
  menu.sub = sub;
  menu.subAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  return sub;
}

function startCascadeButton(title, icon, open) {
  const row = button(null, () => open(row), "menu-item");
  row.setAttribute("role", "menuitem");
  row.setAttribute("aria-haspopup", "true");
  row.setAttribute("aria-expanded", "false");
  row.append(retroIcon(icon, 20), element("span", "", title), element("span", "menu-arrow"));
  return row;
}

function recentMenuEntries() {
  const entries = [["My Documents", "documents", () => openFileLocation("documents")], null];
  if (!recentDesktopFiles.length) return [...entries, ["No recent workspace files", "", () => {}, true]];
  return [...entries, ...recentDesktopFiles.map(entry => [
    entry.name, entry.zip ? "zip" : "paper", () => fileCommand("open-catalog", entry.key)
  ])];
}

function startDocuments(anchor) {
  const sub = startCascade(anchor, recentMenuEntries());
  if (sub) {
    sub.classList.add("recent-menu");
    fileCommand("recent");
  }
}

window.fileRecentState = snapshot => {
  recentDesktopFiles = snapshot.entries;
  if (!menu?.sub?.classList.contains("recent-menu")) return;
  menu.sub.replaceChildren();
  menuItems(menu.sub, recentMenuEntries());
  positionMenu(menu.sub, parseFloat(menu.sub.style.left), parseFloat(menu.sub.style.top));
};

function updateQuickLaunch() {
  const rail = document.getElementById("quick-launch");
  rail.querySelectorAll(".quick-pinned").forEach(node => node.remove());
  for (const id of state.quickLaunch) {
    const app = DESKTOP_APPS.get(id) || luaPrograms.get(id) || installed.get(id);
    if (!app) continue;
    let fromHold = false;
    const item = button(null, () => {
      if (!fromHold) openProgram(app);
      fromHold = false;
    }, "quick-pinned");
    item.title = app.name;
    item.setAttribute("aria-label", app.name);
    item.append(retroIcon(app.art || "app", 18, app.icon));
    const removeMenu = (x, y) => showMenu([quickLaunchCommand(app)], x, y, item);
    item.addEventListener("contextmenu", event => {
      event.preventDefault();
      removeMenu(event.clientX, event.clientY);
    });
    let hold;
    item.addEventListener("pointerdown", event => {
      fromHold = false;
      if (event.pointerType === "touch") hold = setTimeout(() => {
        fromHold = true;
        removeMenu(event.clientX, event.clientY);
      }, 520);
    });
    for (const event of ["pointerup", "pointerleave", "pointercancel"]) {
      item.addEventListener(event, () => clearTimeout(hold));
    }
    rail.append(item);
  }
}

function quickLaunchCommand(app) {
  if (app.id === "browser") return ["Already in Quick Launch", "desktop", () => {}, true];
  return [state.quickLaunch.includes(app.id) ? "Unpin from Quick Launch" : "Pin to Quick Launch",
    "desktop", () => toggleQuickLaunch(app)];
}

function toggleQuickLaunch(app) {
  if (state.quickLaunch.includes(app.id)) state.quickLaunch = state.quickLaunch.filter(id => id !== app.id);
  else {
    if (state.quickLaunch.length >= 24) {
      announce("Unpin an app before adding another Quick Launch shortcut.");
      return;
    }
    state.quickLaunch.push(app.id);
  }
  saveState();
  updateQuickLaunch();
}

function trayState() {
  try { return JSON.parse(native?.desktopTrayStatus?.() || "{}"); }
  catch (error) { return {}; }
}

function describeBattery(info) {
  if (!Number.isFinite(info.battery)) return "Battery status unavailable";
  return info.battery + "% " + (info.charging ? "· Charging" : info.plugged ? "· Plugged in" : "· On battery");
}

function updatePowerTray(info = trayState()) {
  const battery = document.getElementById("battery-tray");
  battery.title = describeBattery(info);
  battery.replaceChildren(retroIcon(info.plugged ? "charging" : "battery", 17));
}

function trayPopup(anchor, title, contents) {
  if (menu?.anchor === anchor) { closeMenu(); return; }
  closeMenu();
  const panel = element("div", "popup bevel tray-popup");
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", title);
  panel.append(...contents);
  transient.append(panel);
  const bounds = anchor.getBoundingClientRect();
  positionMenu(panel, bounds.left, bounds.top - panel.offsetHeight - 3);
  menu = {panel, anchor};
  anchor.setAttribute("aria-expanded", "true");
  syncBrowserPosition();
}

function showTrayVolume(anchor) {
  const info = trayState();
  const title = element("strong", "", "Media Volume");
  if (!Number.isFinite(info.volume)) {
    trayPopup(anchor, "Media Volume", [title, element("span", "", "Volume control is unavailable.")]);
    return;
  }
  const value = element("output", "tray-volume-value");
  const slider = element("input");
  slider.type = "range";
  slider.setAttribute("aria-label", "Media volume");
  slider.min = info.min || 0;
  slider.max = info.max;
  slider.value = info.volume;
  slider.disabled = info.fixed === true;
  const update = () => { value.textContent = Math.round(100 * Number(slider.value) / Math.max(1, info.max)) + "%"; };
  slider.addEventListener("input", () => {
    update();
    native?.setDesktopVolume?.(Number(slider.value));
  });
  update();
  trayPopup(anchor, "Media Volume", [title, slider, value]);
}

function initializeShellTray() {
  const volume = document.getElementById("volume-tray");
  const battery = document.getElementById("battery-tray");
  volume.append(retroIcon("speaker", 17));
  volume.addEventListener("click", () => showTrayVolume(volume));
  battery.addEventListener("click", () => {
    const info = trayState();
    updatePowerTray(info);
    const controls = toolbarButton("Battery Settings…", () => { closeMenu(); system("battery"); });
    trayPopup(battery, "Power Status", [element("strong", "", "Power Status"),
      element("span", "", describeBattery(info)), controls]);
  });
  updatePowerTray();
  setInterval(() => { if (desktopVisible && !document.hidden) updatePowerTray(); }, 45000);
}

function renderActiveDesktop() {
  const panel = document.getElementById("active-desktop");
  panel.hidden = !Object.values(state.channels).some(Boolean);
  document.documentElement.classList.toggle("has-desktop-channels", !panel.hidden);
  if (panel.hidden) {
    activeTrackLabel = activeTrackToggle = null;
    return;
  }
  const header = element("header", "channels-title");
  const close = button("×", () => {
    state.channels = {search: false, note: false, music: false};
    saveState();
    renderActiveDesktop();
  }, "bevel");
  close.setAttribute("aria-label", "Turn off Active Desktop");
  header.append(element("strong", "", "Active Desktop"), close);
  const content = [header];
  if (state.channels.search) {
    const search = element("form", "channel search-channel");
    const label = element("label", "", "QuietSeek Channel");
    const input = element("input", "text-entry");
    input.id = "quietseek-channel-search";
    input.type = "search";
    input.maxLength = 400;
    input.autocomplete = "off";
    label.htmlFor = input.id;
    const submit = element("button", "bevel tool-button", "Search");
    submit.type = "submit";
    search.append(label, input, submit);
    search.addEventListener("submit", event => {
      event.preventDefault();
      const query = input.value.trim();
      if (query) openWindow("browser", "$browser", {address: browserSearchAddress(query)});
    });
    content.push(search);
  }
  if (state.channels.note) {
    const note = element("div", "channel note-channel");
    note.append(element("strong", "", "Scratch Note"), toolbarButton("Edit", () => openWindow("notepad")));
    note.append(element("p", "channel-note", getNote().trim() || "Empty"));
    content.push(note);
  }
  activeTrackLabel = activeTrackToggle = null;
  if (state.channels.music) {
    const track = element("div", "channel track-channel");
    activeTrackLabel = element("p", "");
    activeTrackToggle = toolbarButton("Play", () => audioCommand("toggle"));
    track.append(element("strong", "", "Now Playing"), activeTrackLabel, activeTrackToggle,
      toolbarButton("RetroAMP", () => openWindow("music")));
    content.push(track);
  }
  panel.replaceChildren(...content);
  updateMusicChannel();
}

function updateMusicChannel() {
  if (!activeTrackLabel) return;
  activeTrackLabel.textContent = retroAudio.title || "No track selected";
  activeTrackToggle.disabled = !retroAudio.tracks.length;
  activeTrackToggle.textContent = retroAudio.phase === "playing" || retroAudio.pendingPlay ? "Pause" : "Play";
}

function updateNoteChannel() {
  const note = document.querySelector("#active-desktop .channel-note");
  if (note) note.textContent = getNote().trim() || "Empty";
}

function renderChannelSettings(win) {
  const form = element("form", "window-form");
  const choices = [["search", "QuietSeek Channel"], ["note", "Scratch Note"], ["music", "Now Playing"]];
  const inputs = new Map();
  for (const [key, name] of choices) {
    const label = element("label", "check-label");
    const input = element("input");
    input.type = "checkbox";
    input.checked = state.channels[key];
    inputs.set(key, input);
    label.append(input, element("span", "", name));
    form.append(label);
  }
  formActions(form, "Apply", "Cancel", () => closeWindow(win.id));
  form.addEventListener("submit", event => {
    event.preventDefault();
    for (const [key, input] of inputs) state.channels[key] = input.checked;
    saveState();
    renderActiveDesktop();
    closeWindow(win.id);
  });
  win.body.replaceChildren(form);
}

function isDesktopAsleep() {
  return !document.getElementById("desktop-power").hidden;
}

function resumeDesktopSession() {
  clearTimeout(sessionTimer);
  document.getElementById("desktop-power").hidden = true;
  for (const id of ["desktop", "active-desktop", "taskbar"]) document.getElementById(id).inert = false;
  applyDisplaySettings();
  desktopSound("startup");
  desktop.focus({preventScroll: true});
}

function setDesktopSession(restart) {
  const overlay = document.getElementById("desktop-power");
  closeMenu();
  stopScreenSaver();
  setClippyVisible(false);
  desktopSound("shutdown");
  for (const id of [...openWindows.keys()]) closeWindow(id, true);
  native?.audioCommand?.("stop", "");
  showDesktopWindows = [];
  selectItem(null, null);
  overlay.hidden = false;
  for (const id of ["desktop", "active-desktop", "taskbar"]) document.getElementById(id).inert = true;
  overlay.replaceChildren(element("strong", "", restart ? "Windows 98" : "Windows has shut down."),
    element("p", "", restart ? "Starting Retro Desktop…" : "The launcher session has ended."));
  if (restart) sessionTimer = setTimeout(resumeDesktopSession, 850);
  else {
    const start = button("Start Windows", resumeDesktopSession);
    overlay.append(start);
    start.focus();
  }
  applyDisplaySettings();
}

function renderPowerDialog(win) {
  const form = element("form", "window-form");
  const intro = element("div", "dialog-top");
  intro.append(retroIcon("shutdown", 34), element("p", "", "What do you want the launcher to do?"));
  form.append(intro);
  for (const [value, title] of [["shutdown", "Shut down"], ["restart", "Restart"]]) {
    const label = element("label", "check-label");
    const choice = element("input");
    choice.type = "radio";
    choice.name = "power";
    choice.value = value;
    choice.checked = value === "shutdown";
    label.append(choice, element("span", "", title));
    form.append(label);
  }
  form.append(element("small", "", "Save your work before ending the launcher session."));
  formActions(form, "OK", "Cancel", () => closeWindow(win.id));
  form.addEventListener("submit", event => {
    event.preventDefault();
    setDesktopSession(form.elements.power.value === "restart");
  });
  win.body.replaceChildren(form);
}
