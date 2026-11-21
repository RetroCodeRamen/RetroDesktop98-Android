"use strict";

const desktopThemes = {
  classic: {name: "Windows Classic", color: "Teal"},
  ocean: {name: "Ocean", color: "Blue"},
  plum: {name: "Plum", color: "Plum"},
  midnight: {name: "Midnight", color: "Black"},
  science: {name: "Science Fiction", color: "Navy"},
  underwater: {name: "Underwater", color: "Blue"}
};
const themePacks = {
  classic: {name: "Classic", scheme: "classic", sounds: "classic", saver: "windows"},
  science: {name: "Science Fiction", scheme: "science", sounds: "space", saver: "stars"},
  underwater: {name: "Underwater", scheme: "underwater", sounds: "water", saver: "bubbles"}
};
const saverChoices = {off: "None", windows: "Flying Windows", stars: "Starfield", bubbles: "Bubbles"};
const wallpaperFits = {cover: "Fill", contain: "Fit", center: "Center", repeat: "Tile"};
const soundChoices = {off: "None", classic: "Classic", soft: "Soft", space: "Science Fiction", water: "Underwater"};
let desktopVisible = true;
let saverTimer = 0;
let saverFrame = 0;
let saverCanvas;
let audio;
let startupPlayed = false;
let desktopAwake;
let lastMouseActivity = 0;

function pickSetting(choices, value, fallback) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(choices, value) ? value : fallback;
}

function displaySettings(saved) {
  return {
    theme: pickSetting(desktopThemes, saved.theme, "classic"),
    themePack: pickSetting(themePacks, saved.themePack, ""),
    packWallpaper: saved.packWallpaper === true,
    wallpaperFit: pickSetting(wallpaperFits, saved.wallpaperFit, "cover"),
    sounds: pickSetting(soundChoices, saved.sounds, "off"),
    saver: pickSetting(saverChoices, saved.saver, "off"),
    idleMinutes: [1, 3, 5, 10, 15].includes(saved.idleMinutes) ? saved.idleMinutes : 3
  };
}

function screenOrientation() {
  return (native?.isLandscape?.() ?? matchMedia("(orientation: landscape)").matches)
    ? "landscape" : "portrait";
}

function canRememberLayout(win) {
  return !win.options.dialog && win.kind !== "folder" && win.kind !== "run" && win.kind !== "lua-preview";
}

function validWindowLayouts(layouts) {
  const valid = {};
  for (const orientation of ["portrait", "landscape"]) {
    const entries = layouts?.[orientation];
    if (!entries || typeof entries !== "object") continue;
    valid[orientation] = {};
    for (const [id, entry] of Object.entries(entries).slice(0, 40)) {
      if (!/^\$[a-z][a-z-]{1,19}$/.test(id) || !entry || typeof entry !== "object" ||
          ![entry.x, entry.y, entry.width, entry.height].every(value =>
            Number.isFinite(value) && value >= 0 && value <= 20000) || entry.width < 1 || entry.height < 1) continue;
      const {x, y, width, height} = entry;
      valid[orientation][id] = {x, y, width, height, maximized: entry.maximized === true};
    }
  }
  return valid;
}

function restoreWindowLayout(win) {
  if (!canRememberLayout(win)) return;
  const layout = state.layouts[currentOrientation]?.[win.id];
  win.x = layout?.x;
  win.y = layout?.y;
  win.width = layout?.width ?? win.baseWidth;
  win.height = layout?.height ?? win.baseHeight;
  setWindowMaximized(win, !!layout?.maximized);
}

function rememberWindowLayout(win) {
  if (!canRememberLayout(win)) return;
  const layouts = state.layouts[currentOrientation] ||= {};
  layouts[win.id] = {
    x: win.maximized ? (win.x ?? 5) : win.node.offsetLeft,
    y: win.maximized ? (win.y ?? 5) : win.node.offsetTop,
    width: win.width, height: win.height, maximized: win.maximized
  };
  saveState();
}

function applyDisplaySettings() {
  const root = document.documentElement;
  root.style.setProperty("--desktop", colors[state.color]);
  root.dataset.theme = state.theme;
  root.dataset.wallpaperFit = state.wallpaperFit;
  root.dataset.themeWallpaper = state.packWallpaper ? state.themePack : "";
  const enabled = state.saver !== "off" && !isDesktopAsleep();
  if (desktopAwake !== enabled) {
    desktopAwake = enabled;
    native?.keepDesktopAwake?.(enabled);
  }
  resetSaverTimer();
}

function desktopSound(kind, scheme = state.sounds) {
  if (scheme === "off") return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ||= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const startup = {classic: [392, 523, 659, 784], soft: [392, 523, 659, 784],
      space: [165, 247, 330, 494, 659], water: [523, 622, 698, 587, 784]};
    const notes = kind === "error" ? [392, 294] : kind === "shutdown" ? [494, 392, 294] : startup[scheme];
    const origin = audio.currentTime;
    notes.forEach((note, index) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const start = origin + index * 0.085;
      tone.type = scheme === "soft" || scheme === "water" ? "sine" : scheme === "space" ? "sawtooth" : "triangle";
      tone.frequency.value = note;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.29);
    });
  } catch (error) {
    // Audio is optional on devices where playback is restricted.
  }
}

function resetSaverTimer() {
  clearTimeout(saverTimer);
  if (desktopVisible && !document.hidden && !isDesktopAsleep() && state.saver !== "off" && !saverCanvas) {
    saverTimer = setTimeout(() => startScreenSaver(state.saver), state.idleMinutes * 60000);
  }
}

function startScreenSaver(kind) {
  stopScreenSaver();
  if (kind === "off") return;
  clearTimeout(saverTimer);
  closeMenu();
  document.activeElement?.blur();
  const canvas = element("canvas", "screen-saver");
  canvas.setAttribute("aria-label", "Screen saver. Tap or press any key to dismiss.");
  document.body.append(canvas);
  saverCanvas = canvas;
  document.documentElement.classList.add("saver-running");
  syncBrowserPosition();
  syncAudioMeter();
  const context = canvas.getContext("2d");
  const stars = Array.from({length: 85}, () => ({
    x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, depth: Math.random()
  }));
  const mark = retroIcon("start", 96);
  const started = performance.now();
  let previous = started;
  function draw(now) {
    const elapsed = (now - started) / 1000;
    const step = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
    }
    const {width, height} = canvas;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (kind === "stars") {
      const distance = Math.min(width, height) * 0.47;
      for (const star of stars) {
        star.depth -= step * 0.33;
        let x = width / 2 + star.x * distance / Math.max(0.03, star.depth);
        let y = height / 2 + star.y * distance / Math.max(0.03, star.depth);
        if (star.depth <= 0.03 || x < 0 || x >= width || y < 0 || y >= height) {
          Object.assign(star, {x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, depth: 1});
          x = width / 2 + star.x * distance;
          y = height / 2 + star.y * distance;
        }
        const size = Math.max(1, (1 - star.depth) * 4);
        context.fillStyle = "rgba(255,255,255," + (1 - star.depth * 0.8) + ")";
        context.fillRect(x, y, size, size);
      }
    } else if (kind === "bubbles") {
      context.fillStyle = "#051d39";
      context.fillRect(0, 0, width, height);
      for (const bubble of stars.slice(0, 30)) {
        const radius = 3 + bubble.depth * 18;
        const progress = ((elapsed * (0.08 + bubble.depth * 0.07) + (bubble.y + 1) / 2) % 1);
        const y = height + 29 - progress * (height + 58);
        const x = (bubble.x + 1) * width / 2 + Math.sin(elapsed + bubble.y * 6) * 12;
        context.strokeStyle = ["#3c789d", "#4fa9b9", "#79d0dd"][Math.floor(bubble.depth * 3)];
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.stroke();
        context.fillStyle = "#b5f0e9";
        context.fillRect(x - radius * 0.58, y - radius * 0.59, 2, 2);
      }
    } else if (mark.complete && mark.naturalWidth) {
      for (let index = 0; index < 5; index++) {
        const phase = elapsed * (0.47 + index * 0.06) + index * 1.9;
        const size = 35 + (Math.sin(phase * 2) + 1) * 25;
        const x = (Math.sin(phase) + 1) * Math.max(0, width - size) / 2;
        const y = (Math.cos(phase * 1.3) + 1) * Math.max(0, height - size) / 2;
        context.imageSmoothingEnabled = false;
        context.drawImage(mark, x, y, size, size);
      }
    }
    saverFrame = requestAnimationFrame(draw);
  }
  saverFrame = requestAnimationFrame(draw);
}

function stopScreenSaver() {
  if (!saverCanvas) return false;
  cancelAnimationFrame(saverFrame);
  saverCanvas.remove();
  saverCanvas = null;
  document.documentElement.classList.remove("saver-running");
  syncAudioMeter();
  resetSaverTimer();
  syncBrowserPosition();
  return true;
}

for (const eventName of ["pointerdown", "keydown", "wheel"]) {
  document.addEventListener(eventName, event => {
    if (stopScreenSaver()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!startupPlayed && event.isTrusted && eventName !== "wheel") {
      startupPlayed = true;
      desktopSound("startup");
    }
    resetSaverTimer();
  }, {capture: true, passive: false});
}
document.addEventListener("pointermove", event => {
  if (event.pointerType !== "mouse") return;
  if (stopScreenSaver()) return;
  const now = performance.now();
  if (now - lastMouseActivity < 900) return;
  lastMouseActivity = now;
  resetSaverTimer();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopScreenSaver();
  resetSaverTimer();
});
window.desktopInteraction = resetSaverTimer;
window.setDesktopVisible = visible => {
  desktopVisible = visible;
  syncDosBoxPosition();
  syncAudioMeter();
  if (!visible) stopScreenSaver();
  resetSaverTimer();
};

function displaySelect(parent, label, values, current) {
  const field = element("div", "form-label");
  const caption = element("label", "", label);
  const select = element("select", "text-entry");
  select.id = "display-" + label.toLowerCase().replaceAll(" ", "-");
  caption.htmlFor = select.id;
  for (const [value, name] of Object.entries(values)) select.add(new Option(name, value));
  select.value = current;
  field.append(caption, select);
  parent.append(field);
  return select;
}

function renderDisplay(win) {
  const form = element("form", "window-form display-form");
  const settings = element("div", "display-fields");
  const packChoice = displaySelect(settings, "Theme pack", Object.fromEntries(
    [["", "Individual settings"], ...Object.entries(themePacks).map(([id, pack]) => [id, pack.name])]), state.themePack);
  let usePackWallpaper = state.packWallpaper;
  const theme = displaySelect(settings, "Theme", Object.fromEntries(
    Object.entries(desktopThemes).map(([id, options]) => [id, options.name])), state.theme);
  const color = displaySelect(settings, "Desktop color", Object.fromEntries(
    Object.keys(colors).map(name => [name, name])), state.color);
  theme.addEventListener("change", () => { color.value = desktopThemes[theme.value].color; });
  const fit = displaySelect(settings, "Wallpaper layout", wallpaperFits, state.wallpaperFit);
  const wallpaperControls = element("div", "wallpaper-controls");
  const pick = toolbarButton("Choose Image…", () => native?.wallpaperCommand?.("choose"));
  const restorePack = toolbarButton("Use Pack Wallpaper", () => {
    if (!packChoice.value) return;
    usePackWallpaper = true;
    announce("Apply to use the theme pack wallpaper.");
  });
  restorePack.disabled = !packChoice.value;
  const remove = toolbarButton("Remove Image", () => native?.wallpaperCommand?.("remove"));
  remove.disabled = !hasWallpaper;
  win.removeWallpaper = remove;
  wallpaperControls.append(pick, remove, restorePack);
  settings.append(wallpaperControls);
  const sounds = displaySelect(settings, "Sound scheme", soundChoices, state.sounds);
  settings.append(toolbarButton("Play Sample", () => desktopSound("startup", sounds.value)));
  const saver = displaySelect(settings, "Screen saver", saverChoices, state.saver);
  const idle = displaySelect(settings, "Wait", {1: "1 minute", 3: "3 minutes", 5: "5 minutes",
    10: "10 minutes", 15: "15 minutes"}, String(state.idleMinutes));
  const preview = toolbarButton("Preview", () => startScreenSaver(saver.value));
  const hint = element("small", "saver-hint", "A screen saver keeps the screen awake while the launcher is visible.");
  const refresh = () => { preview.disabled = idle.disabled = hint.hidden = saver.value === "off"; };
  saver.addEventListener("change", refresh);
  packChoice.addEventListener("change", () => {
    const pack = themePacks[packChoice.value];
    usePackWallpaper = Boolean(pack);
    restorePack.disabled = !pack;
    if (!pack) return;
    theme.value = pack.scheme;
    color.value = desktopThemes[pack.scheme].color;
    sounds.value = pack.sounds;
    saver.value = pack.saver;
    refresh();
  });
  win.customWallpaperChosen = () => { usePackWallpaper = false; };
  refresh();
  settings.append(preview, hint);
  const tapLabel = element("label", "check-label");
  const doubleTap = element("input");
  doubleTap.type = "checkbox";
  doubleTap.checked = state.doubleTap;
  tapLabel.append(doubleTap, element("span", "", "Double-tap desktop icons to open"));
  settings.append(tapLabel);
  form.append(settings);
  formActions(form, "Apply", "Cancel", () => closeWindow(win.id),
    button("Android Display…", () => system("display")));
  form.addEventListener("submit", event => {
    event.preventDefault();
    Object.assign(state, {
      color: color.value, theme: theme.value, themePack: packChoice.value, packWallpaper: usePackWallpaper,
      wallpaperFit: fit.value,
      doubleTap: doubleTap.checked, sounds: sounds.value, saver: saver.value, idleMinutes: Number(idle.value)
    });
    applyState();
    closeWindow(win.id);
  });
  win.body.replaceChildren(form);
}

function renderDesktopBackup(win) {
  const form = element("div", "window-form");
  form.append(element("p", "", "Save your shortcuts, folders, window layouts, theme, and wallpaper to one file."),
    element("p", "", "Restoring a backup replaces the desktop setup on this device."));
  const actions = element("div", "app-toolbar");
  actions.append(toolbarButton("Export…", () => native?.desktopFile?.("export", "", JSON.stringify(state))),
    toolbarButton("Restore…", () => native?.desktopFile?.("restore", "", "")));
  form.append(actions);
  win.body.replaceChildren(form);
}

function readBackupLayout(value) {
  if (!value || !Array.isArray(value.items) || value.items.length > 4000) throw Error("Invalid desktop layout");
  const items = new Map();
  for (const item of value.items) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(item.id) ||
        items.has(item.id) || (!["app", "builtin", "folder", "system"].includes(item.type) && !workspaceShortcutType(item.type)) ||
        typeof item.name !== "string" || !item.name.trim() || item.name.length > 512 ||
        typeof item.target !== "string" || item.target.length > (workspaceShortcutType(item.type) ? 4096 : 1024) ||
        (item.parent !== null && typeof item.parent !== "string")) throw Error("Invalid shortcut");
    if (workspaceShortcutType(item.type) && !validWorkspaceShortcut(item.target)) throw Error("Invalid workspace shortcut");
    if (item.type === "system" && !initialItems.some(original => original.target === item.target)) throw Error("Invalid system shortcut");
    if (item.type === "builtin" && !DESKTOP_APPS.has(item.target) && !isLuaProgramId(item.target)) throw Error("Unknown built-in shortcut");
    const {id, type, name, target, parent, col, row} = item;
    const normalized = {id, type, name, target, parent};
    if (item.removed === true) normalized.removed = true;
    if (Number.isInteger(col) && col >= 0 && col <= 4000) normalized.col = col;
    if (Number.isInteger(row) && row >= 0 && row <= 4000) normalized.row = row;
    items.set(id, normalized);
  }
  for (const item of items.values()) {
    let parentId = item.parent;
    const visited = new Set([item.id]);
    while (parentId !== null) {
      const parent = items.get(parentId);
      if (visited.has(parentId) || visited.size > 128 || parent?.type !== "folder") throw Error("Invalid folder structure");
      visited.add(parentId);
      parentId = parent.parent;
    }
  }
  return {
    ...displaySettings(value), ...shellSettings(value), color: pickSetting(colors, value.color, "Teal"),
    doubleTap: value.doubleTap === true, items: [...items.values()], layouts: validWindowLayouts(value.layouts)
  };
}

window.desktopBackupPreview = backup => {
  try {
    const layout = readBackupLayout(backup.layout);
    dialog({kind: "backup-restore", title: "Restore Desktop", icon: "desktop",
      message: "Replace the current desktop layout, display settings, and wallpaper with this backup?",
      accept: "Restore", cancel: "Cancel", onAccept: () => {
        native?.desktopFile?.("apply-backup", backup.token, JSON.stringify(layout));
      }});
  } catch (error) {
    announce("That backup contains an invalid desktop layout.");
  }
};

window.desktopBackupApplied = layout => {
  Object.assign(state, layout);
  selectItem(null, null);
  renderLayout();
  openWindows.forEach(win => {
    restoreWindowLayout(win);
    placeWindow(win);
  });
  const display = openWindows.get("$display");
  if (display) renderDisplay(display);
  announce("Desktop restored.");
};

window.useCustomWallpaper = () => {
  openWindows.get("$display")?.customWallpaperChosen?.();
  if (!state.packWallpaper) return;
  state.packWallpaper = false;
  saveState();
  applyDisplaySettings();
};
