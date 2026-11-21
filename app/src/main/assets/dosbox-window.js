"use strict";

let dosBoxPlacementPending = false;

function isDosPackage(name) {
  return /\.(zip|dosz|jsdos)$/i.test(name);
}

function renderDosBox(win) {
  const toolbar = element("div", "app-toolbar");
  const panel = element("div", "explorer dosbox-overlay");
  panel.append(element("p", "empty-note", "Import a DOS game ZIP, DOSZ, or JSDOS, or open the demo."));
  toolbar.append(
    toolbarButton("Import Game…", () => native?.dosBoxCommand?.("choose", "")),
    toolbarButton("Store…", () => openWindow("dos-store")),
    toolbarButton("My DOS Games", () => openFileLocation("games")),
    toolbarButton("Demo", () => native?.dosBoxCommand?.("demo", ""))
  );
  const status = appStatus("Ready");
  Object.assign(win, {dosBoxPanel:panel, dosBoxStatus:status,
    cleanup:() => native?.dosBoxCommand?.("close", "")});
  win.body.replaceChildren(toolbar, panel, status);
}

function playWorkspaceDosGame(key) {
  openWindow("dosbox");
  native?.dosBoxCommand?.("workspace", key);
}

window.dosBoxStarted = session => {
  const win = openWindow("dosbox");
  win.dosBoxRunning = true;
  win.title = "DOSBox · " + session.title;
  win.titleLabel.textContent = win.title;
  win.dosBoxStatus.textContent = "Starting DOSBox…";
  win.dosBoxPanel.replaceChildren();
  renderTasks();
  syncDosBoxPosition();
};

window.dosBoxStatus = data => {
  const win = openWindows.get("$dosbox");
  if (win) win.dosBoxStatus.textContent = data.message;
  else announce(data.message);
};

function syncDosBoxPosition() {
  if (!native?.dosBoxPlace || dosBoxPlacementPending) return;
  dosBoxPlacementPending = true;
  requestAnimationFrame(() => {
    dosBoxPlacementPending = false;
    const win = openWindows.get("$dosbox");
    if (!win?.dosBoxRunning || win.minimized || activeWindow !== win.id || menu || !desktopVisible ||
        document.documentElement.classList.contains("saver-running") || isDesktopAsleep()) {
      native.dosBoxPlace(0, 0, 0, 0);
      return;
    }
    const bounds = win.dosBoxPanel.getBoundingClientRect();
    const assistant = document.getElementById("clippy-panel");
    if (assistant && !assistant.hidden) {
      const clip = assistant.getBoundingClientRect();
      if (clip.left < bounds.right && clip.right > bounds.left && clip.top < bounds.bottom && clip.bottom > bounds.top) {
        native.dosBoxPlace(0, 0, 0, 0);
        return;
      }
    }
    const scale = window.devicePixelRatio || 1;
    native.dosBoxPlace(Math.round((bounds.left + 2) * scale), Math.round((bounds.top + 2) * scale),
      Math.round(Math.max(0, bounds.width - 4) * scale), Math.round(Math.max(0, bounds.height - 4) * scale));
  });
}

function workspaceShortcutType(type) {
  return ["workspace-file", "workspace-folder", "dosbox-game"].includes(type);
}

function validWorkspaceShortcut(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 4096 &&
    key.split("/").every(part => part && part !== "." && part !== ".." && !/[:\\\u0000-\u001f]/.test(part));
}

function pinWorkspaceFile(entry, game = false) {
  if (!validWorkspaceShortcut(entry.key)) return;
  const type = game ? "dosbox-game" : entry.folder ? "workspace-folder" : "workspace-file";
  if (children(null).some(item => item.type === type && item.target === entry.key)) {
    announce("That shortcut is already on the desktop.");
    return;
  }
  const name = game ? entry.name.replace(/\.(zip|dosz|jsdos)$/i, "") : entry.name;
  createItem(type, name.slice(0, 70), null, entry.key);
  announce("Shortcut added to Desktop.");
}

window.workspaceShortcutMoved = move => {
  if (!validWorkspaceShortcut(move.from) || !validWorkspaceShortcut(move.to)) return;
  let changed = false;
  for (const item of state.items) {
    if (!workspaceShortcutType(item.type)) continue;
    if (item.target === move.from || item.target.startsWith(move.from + "/")) {
      item.target = move.to + item.target.slice(move.from.length);
      changed = true;
    }
  }
  if (changed) saveState();
};
