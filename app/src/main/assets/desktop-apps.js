"use strict";

const DESKTOP_APPS = new Map([
  ["browser", "Internet Explorer", "browser", "Accessories", 620, 570, renderBrowser],
  ["calculator", "Calculator", "calculator", "Accessories", 278, 345, renderCalculator],
  ["files", "Windows Explorer", "folder", "Accessories", 705, 450, renderFileBrowser],
  ["archives", "Compressed Folders", "zip", "Accessories", 495, 405, renderArchiveWindow],
  ["notepad", "Notepad", "paper", "Accessories", 440, 392, renderNotepad],
  ["lua-studio", "Lua Studio", "lua", "Accessories", 880, 610, renderLuaStudio],
  ["paint", "Paint", "paint", "Accessories", 680, 515, renderPaint],
  ["wordpad", "WordPad", "wordpad", "Accessories", 580, 466, renderWordPad],
  ["recorder", "Sound Recorder", "recorder", "Accessories", 470, 364, renderSoundRecorder],
  ["music", "RetroAMP", "music", "Accessories", 485, 375, renderRetroAmp],
  ["mail", "Outlook Express", "mail", "Accessories", 580, 535, renderMailApp],
  ["terminal", "HyperTerminal", "terminal", "Accessories", 690, 485, renderHyperTerminal],
  ["dosbox", "DOSBox", "terminal", "Games", 650, 540, renderDosBox],
  ["dos-store", "DOSBox Store", "disk", "Games", 515, 570, renderDosStore],
  ["dos", "MS-DOS Prompt", "terminal", "Accessories", 676, 430, renderDosPrompt],
  ["ansi-viewer", "ANSI Viewer", "charmap", "Accessories", 640, 470, renderAnsiViewer],
  ["charmap", "Character Map", "charmap", "Accessories", 420, 365, renderCharacterMap],
  ["mines", "Minesweeper", "mine", "Games", 365, 450, renderMinesweeper],
  ["solitaire", "Solitaire", "cards", "Games", 590, 506, renderSolitaire]
].map(([id, name, art, group, width, height, render]) => [
  id, {id, name, art, group, width, height, render, builtin: true}
]));

function toolbarButton(label, action) {
  return button(label, action, "bevel tool-button");
}

function appStatus(text) {
  const status = element("div", "explorer-status app-status", text);
  status.setAttribute("role", "status");
  return status;
}

const BROWSER_HOME = "https://quietseek.com/";
let browserPositionPending = false;

function browserSearchAddress(terms) {
  return BROWSER_HOME + "search?" + new URLSearchParams({q: terms, mode: "web"});
}

function syncBrowserPosition() {
  syncDosBoxPosition();
  if (!native?.browserPlace || browserPositionPending) return;
  browserPositionPending = true;
  requestAnimationFrame(() => {
    browserPositionPending = false;
    const win = openWindows.get("$browser");
    if (document.documentElement.classList.contains("saver-running") || !win?.browserPanel || win.minimized || activeWindow !== win.id || menu || !win.browserAddress) {
      native.browserPlace(0, 0, 0, 0);
      return;
    }
    const bounds = win.browserPanel.getBoundingClientRect();
    const assistant = document.getElementById("clippy-panel");
    if (assistant && !assistant.hidden) {
      const panel = assistant.getBoundingClientRect();
      if (panel.left < bounds.right && panel.right > bounds.left &&
          panel.top < bounds.bottom && panel.bottom > bounds.top) {
        native.browserPlace(0, 0, 0, 0);
        return;
      }
    }
    const scale = window.devicePixelRatio || 1;
    native.browserPlace(Math.round((bounds.left + 2) * scale), Math.round((bounds.top + 2) * scale),
      Math.round((bounds.width - 4) * scale), Math.round((bounds.height - 4) * scale));
  });
}

function addressForInput(text) {
  const address = text.trim();
  if (!address) return "";
  if (/^https?:\/\//i.test(address)) return address;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) return "";
  if (/^(?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#].*)?$/i.test(address) && !/\s/.test(address)) {
    const local = /^localhost(?:[/:?#]|$)|^(?:\d+\.){3}\d+(?:[/:?#]|$)/i.test(address);
    return (local ? "http://" : "https://") + address;
  }
  return browserSearchAddress(address);
}

function navigateBrowser(win, input) {
  const address = addressForInput(input);
  if (!address) {
    win.browserStatus.textContent = "Enter a web address or search terms.";
    return;
  }
  if (!native?.browserCommand) {
    win.browserStatus.textContent = "Live browsing is available in the Android launcher.";
    return;
  }
  win.browserAddress = address;
  win.browserInput.value = address;
  win.browserInput.blur();
  win.browserStatus.textContent = "Opening page…";
  win.browserPanel.replaceChildren();
  native.browserCommand("go", address);
  syncBrowserPosition();
}

function renderBrowser(win) {
  const nav = element("div", "app-toolbar");
  const back = toolbarButton("‹", () => native?.browserCommand?.("back", ""));
  back.title = "Back";
  back.setAttribute("aria-label", "Back");
  const forward = toolbarButton("›", () => native?.browserCommand?.("forward", ""));
  forward.title = "Forward";
  forward.setAttribute("aria-label", "Forward");
  const refresh = toolbarButton("Refresh", () => native?.browserCommand?.("refresh", ""));
  const home = toolbarButton("Home", () => navigateBrowser(win, BROWSER_HOME));
  const external = toolbarButton("Open in Android Browser", () => {
    if (win.browserAddress) system("url", win.browserAddress);
    else system("browser");
  });
  back.disabled = forward.disabled = true;
  const downloads = toolbarButton("Downloads", () => openFileLocation("downloads"));
  nav.append(back, forward, refresh, home, downloads, external);

  const form = element("form", "app-toolbar browser-address");
  const input = element("input", "text-entry");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.enterKeyHint = "go";
  input.inputMode = "url";
  input.id = "address-input";
  input.placeholder = "Web address or search QuietSeek";
  const label = element("label", "", "Address");
  label.htmlFor = input.id;
  const go = element("button", "bevel tool-button", "Go");
  go.type = "submit";
  form.append(label, input, go);
  form.addEventListener("submit", event => {
    event.preventDefault();
    navigateBrowser(win, input.value);
  });
  const panel = element("div", "explorer browser-panel");
  panel.append(element("p", "empty-note", "Enter a web address or search to open a page."));
  const status = appStatus("Ready");
  Object.assign(win, {browserInput: input, browserPanel: panel, browserStatus: status,
    browserBack: back, browserForward: forward});
  win.body.replaceChildren(nav, form, panel, status);
  navigateBrowser(win, win.options.address || BROWSER_HOME);
}

window.browserPageState = update => {
  const win = openWindows.get("$browser");
  if (!win) return;
  win.browserAddress = update.address || win.browserAddress;
  if (document.activeElement !== win.browserInput && win.browserAddress) win.browserInput.value = win.browserAddress;
  win.browserStatus.textContent = update.status;
  win.browserBack.disabled = !update.back;
  win.browserForward.disabled = !update.forward;
  syncBrowserPosition();
};

function fileCommand(action, id = "") {
  native?.fileCommand?.(action, id);
}

function openFileLocation(location) {
  const alreadyOpen = openWindows.has("$files");
  openWindow("files", "$files", {location});
  if (alreadyOpen) fileCommand(location);
}

function renderFileBrowser(win) {
  const toolbar = element("div", "app-toolbar");
  const up = toolbarButton("Up", () => fileCommand("up"));
  const select = toolbarButton("Select", () => {
    win.fileSelecting = !win.fileSelecting;
    win.fileSelected.clear();
    renderFileRows(win);
  });
  const send = toolbarButton("Send To…", () => {
    const entries = win.fileSnapshot.entries.filter(entry => win.fileSelected.has(entry.id));
    if (!entries.length) return;
    const bounds = send.getBoundingClientRect();
    const items = [
      ["Compressed Folder…", "zip", () => zipSelection(entries, false)],
      ["Compressed Folder and Share…", "zip", () => zipSelection(entries, true)]
    ];
    if (entries.length === 1 && win.fileSnapshot.local && entries[0].key) {
      const selected = entries[0];
      items.push(null, ["Desktop (create shortcut)", "desktop", () => pinWorkspaceFile(selected)]);
      if (!selected.folder && isDosPackage(selected.name)) items.push(
        ["Open in DOSBox", "terminal", () => playWorkspaceDosGame(selected.key)],
        ["Desktop (DOSBox shortcut)", "terminal", () => pinWorkspaceFile(selected, true)]
      );
    }
    if (entries.length === 1 && !entries[0].folder) items.push(null,
      ["Android Share…", "", () => fileCommand("share", entries[0].id)],
      ["Export Copy…", "paper", () => fileCommand("export-copy", entries[0].id)]);
    showMenu(items, bounds.left, bounds.bottom, send);
  });
  const folders = windowMenu("Go", [
    ["Workspace", "computer", () => fileCommand("home")],
    ["My Documents", "documents", () => fileCommand("documents")],
    ["Downloads", "disk", () => fileCommand("downloads")],
    ["My Pictures", "paint", () => fileCommand("pictures")],
    ["Recordings", "recorder", () => fileCommand("recordings")],
    ["Lua Projects", "lua", () => fileCommand("projects")],
    ["DOS Games", "terminal", () => fileCommand("games")],
    null, ["Browse Android Folder…", "folder", () => fileCommand("android")],
    ["Choose Another Android Folder…", "folder", () => fileCommand("choose")]
  ]);
  const menuBar = element("nav", "window-menubar");
  menuBar.append(windowMenu("File", [
    ["Open Android File…", "paper", () => system("document")],
    ["Open ZIP…", "zip", () => native?.desktopFile?.("open-zip", "", "")],
    ["Copy Android File to My Documents…", "documents", () => native?.desktopFile?.("import-workspace", "", "")],
    ["Refresh", "", () => {
      fileCommand("list");
      if (win.fileSnapshot?.downloads) native?.desktopFile?.("downloads", "", "");
    }],
    null, ["Close", "", () => closeWindow(win.id)]
  ]), windowMenu("Edit", workspaceEditMenu(win)), folders, windowMenu("View", [
    ["List", "", () => explorerView(win, "list")],
    ["Details", "", () => explorerView(win, "details")],
    ["as Web Page", "browser", () => explorerView(win, "web")]
  ]));
  const mkdir = toolbarButton("New Folder…", () =>
    nameDialog("New Folder", "New Folder", name => fileCommand("new-directory", name)));
  const list = element("div", "explorer file-rows");
  list.append(element("p", "empty-note", native?.fileCommand ? "Opening workspace…" : "Workspace files are available in the Android launcher."));
  const status = appStatus("Ready");
  const explorer = renderExplorerFrame(win, list);
  toolbar.append(up, toolbarButton("Workspace", () => fileCommand("home")), explorer.folders, mkdir, select, send);
  Object.assign(win, {
    fileRows: list, fileUp: up, fileStatus: status, fileMkdir: mkdir,
    fileSelectButton: select, fileSend: send, fileSelected: new Set(), fileSelecting: false,
    cleanup: () => clearTimeout(win.downloadTimer),
    onFocus: () => {
      if (win.fileSnapshot?.downloads) native?.desktopFile?.("downloads", "", "");
    }
  });
  up.disabled = mkdir.disabled = select.disabled = send.disabled = true;
  win.body.replaceChildren(menuBar, toolbar, explorer.location, explorer.frame, status);
  fileCommand(win.options.location || "home");
}

function zipSelection(entries, share) {
  const entry = entries.length === 1 ? entries[0] : null;
  const name = !entry ? "Archive" : entry.folder ? entry.name : entry.name.replace(/\.[^.]+$/, "");
  nameDialog("Compressed Folder", name + ".zip", value => {
    fileCommand(share ? "share-zip" : "zip-selection", JSON.stringify({name: value, items: entries.map(entry => entry.id)}));
  }, 88);
}

function fileRow(name, folder, action, art) {
  const node = button(null, action, "file-row");
  node.append(retroIcon(art || (folder ? "folder" : "paper"), 23), element("span", "", name));
  return node;
}

function selectableFile(entry, selecting, selection, open, update) {
  const row = fileRow(entry.name, entry.folder, open, entry.zip ? "zip" : undefined);
  if (!selecting) return row;
  const toggle = element("input");
  toggle.type = "checkbox";
  toggle.setAttribute("aria-label", "Select " + entry.name);
  toggle.checked = selection.has(entry.id);
  toggle.addEventListener("change", () => {
    if (toggle.checked) selection.add(entry.id);
    else selection.delete(entry.id);
    update();
  });
  const line = element("div", "file-line");
  line.append(toggle, row);
  return line;
}

function renderFileRows(win) {
  const snapshot = win.fileSnapshot;
  if (!snapshot) return;
  const sync = () => {
    win.fileSelectButton.disabled = !snapshot.entries.length && !win.fileSelecting;
    win.fileSelectButton.setAttribute("aria-pressed", String(win.fileSelecting));
    win.fileSend.disabled = !win.fileSelected.size;
    const count = snapshot.entries.length + (snapshot.downloads ? (win.downloadRows?.length || 0) : 0);
    win.fileStatus.textContent = win.fileSelected.size ? win.fileSelected.size + " selected" : objectCount(count);
  };
  const entries = win.fileView === "details" ? displayFiles(snapshot.entries, win.fileSort) : snapshot.entries;
  const rows = entries.map(entry => {
    const node = selectableFile(entry, win.fileSelecting, win.fileSelected, () => locateExplorerEntry(win, entry), sync);
    const row = node.matches("button") ? node : node.querySelector("button");
    row.dataset.file = entry.id;
    row.addEventListener("focus", () => { win.fileCurrent = entry.id; });
    if (snapshot.local) row.addEventListener("contextmenu", event => {
      event.preventDefault();
      showMenu(workspaceEditMenu(win, entry), event.clientX, event.clientY);
    });
    if (win.fileView === "web" && win.fileFocus === entry.id) row.classList.add("file-focused");
    if (win.fileView === "details") {
      row.append(element("small", "file-column", fileSize(entry.size)), element("small", "file-column", fileKind(entry)),
        element("small", "file-column", fileDate(entry.modified)));
    }
    return node;
  });
  if (snapshot.downloads) {
    for (const entry of win.downloadRows || []) {
      const row = fileRow(entry.name, false, () => native?.desktopFile?.("open-download", entry.id, ""));
      row.disabled = !entry.ready;
      row.append(element("small", "download-status", entry.status));
      rows.push(row);
    }
  }
  if (!rows.length) rows.push(element("p", "empty-note", snapshot.message));
  const top = win.fileRows.scrollTop;
  win.fileRows.replaceChildren(...rows);
  win.fileRows.scrollTop = top;
  renderFileDetails(win, snapshot.entries.find(entry => entry.id === win.fileFocus));
  sync();
}

window.fileBrowserState = snapshot => {
  const win = openWindows.get("$files");
  if (!win) return;
  const previous = win.fileSnapshot;
  const navigated = snapshot.path !== previous?.path || snapshot.local !== previous?.local;
  if (navigated) {
    win.fileSelected.clear();
    win.fileSelecting = false;
    win.fileCurrent = null;
    win.fileRows.scrollTop = 0;
  } else {
    const ids = new Set(snapshot.entries.map(entry => entry.id));
    win.fileSelected.forEach(id => { if (!ids.has(id)) win.fileSelected.delete(id); });
  }
  if (!snapshot.downloads) clearTimeout(win.downloadTimer);
  win.fileSnapshot = snapshot;
  refreshExplorerFrame(win, snapshot, navigated);
  win.fileUp.disabled = !snapshot.up;
  win.fileMkdir.disabled = !snapshot.local;
  renderFileRows(win);
  if (snapshot.downloads && !previous?.downloads) native?.desktopFile?.("downloads", "", "");
};

window.refreshFileListing = () => {
  if (openWindows.has("$files")) fileCommand("list");
};

function renderArchiveWindow(win) {
  const toolbar = element("div", "app-toolbar");
  const command = (action, data = "") => native?.desktopFile?.(action, win.archiveSnapshot?.id || "", data);
  const up = toolbarButton("Up", () => command("zip-up"));
  const select = toolbarButton("Select", () => {
    win.archiveSelecting = !win.archiveSelecting;
    win.archiveSelected.clear();
    showArchiveItems(win);
  });
  const extract = toolbarButton("Extract", () => {
    const subset = [...win.archiveSelected];
    dialog({kind: "extract-zip", title: "Extract ZIP", icon: "zip",
      message: subset.length ? "Extract the selected items to " + win.archiveSnapshot.destination + "?" :
        "Extract all files to " + win.archiveSnapshot.destination + "?",
      accept: "Extract", cancel: "Cancel", onAccept: () =>
        command("zip-extract", subset.length ? JSON.stringify(subset) : "")});
  });
  const project = toolbarButton("Open Lua Project", () => command("zip-project"));
  project.hidden = true;
  const status = appStatus("Choose a ZIP archive.");
  const path = element("div", "explorer-status", "Compressed Folders");
  const list = element("div", "explorer file-rows");
  up.disabled = select.disabled = extract.disabled = true;
  toolbar.append(toolbarButton("Open ZIP…", () => command("open-zip")), up, select, extract, project);
  Object.assign(win, {archivePath: path, archiveRows: list, archiveButtons: {up, select, extract, project},
    archiveStatus: status, archiveSelected: new Set(), cleanup: () => command("zip-close")});
  win.body.replaceChildren(toolbar, path, list, status);
}

function showArchiveItems(win) {
  const snapshot = win.archiveSnapshot;
  if (!snapshot) return;
  const {up, select, extract, project} = win.archiveButtons;
  up.disabled = !snapshot.up;
  select.disabled = !snapshot.entries.length;
  select.setAttribute("aria-pressed", String(Boolean(win.archiveSelecting)));
  extract.disabled = !snapshot.hasFiles;
  project.hidden = !snapshot.project;
  const sync = () => {
    extract.textContent = win.archiveSelected.size ? "Extract Selected…" : "Extract All…";
    win.archiveStatus.textContent = win.archiveSelected.size ? win.archiveSelected.size + " selected" : objectCount(snapshot.entries.length);
  };
  const rows = snapshot.entries.map(entry => selectableFile(entry, win.archiveSelecting, win.archiveSelected,
    () => native?.desktopFile?.("zip-entry", snapshot.id, entry.id), sync));
  if (!rows.length) rows.push(element("p", "empty-note", "This folder is empty."));
  win.archiveRows.replaceChildren(...rows);
  sync();
}

window.archiveState = snapshot => {
  const win = snapshot.show ? openWindow("archives") : openWindows.get("$archives");
  if (!win) return;
  win.archiveSelected.clear();
  win.archiveSelecting = false;
  win.archiveSnapshot = snapshot;
  win.title = snapshot.title;
  win.titleLabel.textContent = snapshot.title;
  win.archivePath.textContent = snapshot.title + (snapshot.path ? " / " + snapshot.path : "");
  showArchiveItems(win);
};

window.desktopDownloadOffer = download => {
  dialog({kind: "browser-download", title: "File Download", icon: "browser",
    message: "Save “" + download.name + "” to Windows Explorer → Downloads?",
    accept: "Save", cancel: "Cancel",
    onAccept: () => native?.desktopFile?.("download-confirm", download.id, "")});
};

window.desktopDownloads = snapshot => {
  const win = openWindows.get("$files");
  if (!win?.fileSnapshot?.downloads) return;
  win.downloadRows = snapshot.entries;
  renderFileRows(win);
  clearTimeout(win.downloadTimer);
  if (snapshot.entries.some(entry => entry.status === "Downloading…")) {
    win.downloadTimer = setTimeout(() => {
      if (!document.hidden && desktopVisible && win.fileSnapshot.downloads && !win.minimized) {
        native?.desktopFile?.("downloads", "", "");
      }
    }, 2500);
  }
};

let hasWallpaper = false;
window.setWallpaperStatus = (active, encoded = "") => {
  hasWallpaper = active;
  document.documentElement.classList.toggle("wallpaper", active);
  if (active && encoded) desktop.style.backgroundImage = "url(data:image/jpeg;base64," + encoded + ")";
  else desktop.style.removeProperty("background-image");
  const win = openWindows.get("$display");
  if (win?.removeWallpaper) win.removeWallpaper.disabled = !active;
};

function getNote() {
  return native?.loadNote?.() ?? localStorage.getItem("retro-notepad") ?? "";
}

let noteSaveSequence = 0;

function renderNotepad(win) {
  const toolbar = element("div", "app-toolbar document-tools");
  const editor = element("textarea", "notepad-editor");
  const status = appStatus("");
  let opened;
  let baseline;
  let pendingSave = "";
  editor.setAttribute("aria-label", "Notepad text");
  editor.spellcheck = false;
  editor.maxLength = 150000;
  editor.value = getNote();

  const open = toolbarButton("Open Text…", () => openFileLocation("documents"));
  const scratch = toolbarButton("Scratch Note", () => confirmDiscard(() => setDocument(null)));
  const save = toolbarButton("Save to My Documents", () => saveText(false));
  const saveChanges = toolbarButton("Save Changes", () => saveText(true));
  function saveText(overwrite) {
    if (!native?.desktopFile) return;
    pendingSave = "note:" + (++noteSaveSequence);
    const version = opened;
    const snapshot = editor.value;
    win.finishNoteSave = result => {
      pendingSave = "";
      if (result.ok && opened && opened === version) {
        if (overwrite || !opened.key) {
          baseline = snapshot;
          opened.name = result.name || opened.name;
        }
        if (overwrite && result.revision) opened.revision = result.revision;
      }
      update();
    };
    const payload = overwrite ? {key:opened.key, revision:opened.revision, text:snapshot} :
      {name:opened?.name || "Untitled.txt", text:snapshot};
    native.desktopFile(overwrite ? "update-dos-note" : "save-note", pendingSave, JSON.stringify(payload));
    update();
  }

  function update() {
    const mode = opened ? opened.name + (editor.value !== baseline ? " · Unsaved" : "") : "Saved locally";
    status.textContent = editor.value.length + (editor.value.length === 1 ? " character · " : " characters · ") + mode;
    scratch.disabled = !opened;
    save.disabled = !!pendingSave;
    saveChanges.hidden = !opened?.key;
    saveChanges.disabled = !!pendingSave || editor.value === baseline;
  }

  function confirmDiscard(action) {
    if (!opened || editor.value === baseline) { action(); return; }
    dialog({kind: "note-discard", title: "Notepad", icon: "paper",
      message: "Discard changes to “" + opened.name + "”?", accept: "Discard", cancel: "Keep Editing",
      onAccept: action});
  }

  function setDocument(file) {
    opened = file;
    editor.value = file?.text ?? getNote();
    baseline = editor.value;
    editor.scrollTop = 0;
    update();
  }

  editor.addEventListener("input", () => {
    if (!opened) {
      if (native?.saveNote) native.saveNote(editor.value);
      else localStorage.setItem("retro-notepad", editor.value);
      updateNoteChannel();
    }
    update();
  });
  win.loadTextDocument = file => confirmDiscard(() => setDocument(file));
  win.refreshScratchNote = () => {
    if (!opened && editor.value !== getNote()) setDocument(null);
  };
  win.beforeClose = () => {
    if (!opened || editor.value === baseline) return true;
    confirmDiscard(() => { opened = null; closeWindow(win.id); });
    return false;
  };
  win.noteSaveId = () => pendingSave;
  toolbar.append(open, saveChanges, save, scratch);
  win.body.replaceChildren(toolbar, editor, status);
  update();
}

window.desktopText = file => openWindow("notepad").loadTextDocument(file);

window.desktopFileResult = result => {
  const paint = openWindows.get("$paint");
  if (result.id && result.id === paint?.paintSaveId?.()) paint.finishPaintSave(result.ok, result.name);
  const note = openWindows.get("$notepad");
  if (result.id && result.id === note?.noteSaveId?.()) note.finishNoteSave(result);
  openWindows.get("$lua-studio")?.luaFileSaved?.(result);
  openWindows.get("$wordpad")?.finishWordSave?.(result);
  openWindows.get("$recorder")?.finishRecordingSave?.(result);
  openWindows.get("$terminal")?.terminalSaved?.(result);
  if (result.message) announce(result.message);
};

window.refreshDesktopApps = () => {
  openWindows.get("$notepad")?.refreshScratchNote();
  window.refreshFileListing();
  syncBrowserPosition();
};

function renderCalculator(win) {
  const calculator = element("div", "calculator");
  const display = element("output", "calculator-display sunken", "0");
  display.setAttribute("aria-label", "Calculator result");
  const keys = element("div", "calculator-keys");
  let value = "0";
  let running = null;
  let operation = null;
  let nextValue = false;

  function calculate() {
    const right = Number(value);
    let result;
    switch (operation) {
      case "÷": result = running / right; break;
      case "×": result = running * right; break;
      case "−": result = running - right; break;
      case "+": result = running + right; break;
      default: result = right;
    }
    return Number.isFinite(result) ? String(Number(result.toPrecision(12))) : "Error";
  }

  function press(key) {
    if (value === "Error" || key === "C") {
      value = "0";
      running = null;
      operation = null;
      nextValue = false;
    }
    if (/^\d$/.test(key) || key === ".") {
      if (nextValue) value = "0";
      nextValue = false;
      if (key === "." && !value.includes(".")) value += ".";
      else if (key !== "." && value.length < 14) value = value === "0" ? key : value + key;
    } else if (key === "←" && !nextValue) {
      value = value.length > 1 ? value.slice(0, -1).replace(/^[-+]$/, "0") : "0";
    } else if (key === "±") {
      value = String(-Number(value));
    } else if (key === "%") {
      const fraction = Number(value) / 100;
      value = String(operation === "+" || operation === "−" ? running * fraction : fraction);
    } else if (["÷", "×", "−", "+", "="].includes(key)) {
      if (operation && !nextValue) value = calculate();
      running = key === "=" || value === "Error" ? null : Number(value);
      operation = running === null ? null : key;
      nextValue = true;
    }
    display.textContent = value;
  }

  ["←", "C", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ".", "="]
    .forEach(key => keys.append(button(key, () => press(key), "bevel calculator-key")));
  win.node.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.closest("button")) return;
    const key = {"Enter": "=", "Backspace": "←", "*": "×", "/": "÷", "-": "−", "Delete": "C"}[event.key] || event.key;
    if (key.length === 1 && /[0-9.=C%+×÷−←]/.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      press(key);
    }
  });
  calculator.append(display, keys);
  win.body.replaceChildren(calculator);
}
