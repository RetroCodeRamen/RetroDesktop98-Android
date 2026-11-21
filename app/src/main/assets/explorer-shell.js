"use strict";

let fileSearchSequence = 0;

function workspaceAddress(key = "") {
  return "C:\\" + key.replaceAll("/", "\\");
}

function workspaceKey(address) {
  const match = /^c:(?:[\\/](.*))?$/i.exec(address.trim());
  if (!match) return null;
  const path = (match[1] || "").replaceAll("\\", "/").replace(/\/+$/, "");
  return path.split("/").some(part => part === "." || part === "..") ? null : path;
}

function fileSize(size) {
  if (!(size >= 0)) return "";
  if (size < 1024) return size + " B";
  if (size < 1024 ** 2) return (size / 1024).toFixed(size < 10240 ? 1 : 0) + " KB";
  return (size / 1024 ** 2).toFixed(1) + " MB";
}

function fileDate(timestamp) {
  return timestamp > 0 ? new Date(timestamp).toLocaleDateString() : "";
}

function fileKind(entry) {
  if (entry.folder) return "File Folder";
  if (entry.zip) return "Compressed Folder";
  if (entry.name.toLowerCase().endsWith(".luaform.json")) return "Lua Studio Project";
  const extension = /\.([a-z0-9]{1,8})$/i.exec(entry.name)?.[1];
  return extension ? extension.toUpperCase() + " File" : "File";
}

function explorerView(win, mode) {
  state.explorerView = mode;
  saveState();
  win.fileView = mode;
  win.fileFrame.dataset.view = mode;
  win.filePreview.hidden = mode !== "web";
  win.fileListHeading.hidden = mode !== "details";
  win.fileFocus = null;
  renderFileRows(win);
}

function renderExplorerFrame(win, list) {
  const address = element("input", "text-entry");
  address.type = "text";
  address.id = "workspace-address";
  address.value = workspaceAddress();
  address.spellcheck = false;
  address.autocomplete = "off";
  address.maxLength = 4096;
  address.enterKeyHint = "go";
  const location = element("form", "explorer-address");
  const label = element("label", "", "Address");
  label.htmlFor = address.id;
  const go = element("button", "bevel tool-button", "Go");
  go.type = "submit";
  location.append(label, address, go);
  location.addEventListener("submit", event => {
    event.preventDefault();
    const key = workspaceKey(address.value);
    if (key === null) {
      announce("Enter a workspace path such as C:\\My Documents.");
      return;
    }
    address.blur();
    fileCommand("goto", key);
  });

  const tree = element("nav", "explorer-tree sunken");
  tree.setAttribute("aria-label", "Folder tree");
  const preview = element("aside", "explorer-preview");
  preview.setAttribute("aria-label", "File details");
  const table = element("div", "explorer-file-table");
  const heading = element("div", "explorer-file-heading");
  const columns = [["Name", "name"], ["Size", "size"], ["Type", "type"], ["Modified", "modified"]];
  for (const [labelText, column] of columns) {
    heading.append(button(labelText, () => {
      win.fileSort = {column, descending: win.fileSort.column === column && !win.fileSort.descending};
      renderFileRows(win);
    }, "bevel"));
  }
  table.append(heading, list);
  const frame = element("div", "explorer-frame");
  frame.append(tree, preview, table);
  const folders = toolbarButton("Folders", () => {
    win.fileTreeOpen = !win.fileTreeOpen;
    updateExplorerTree(win);
  });
  folders.setAttribute("aria-controls", "workspace-tree");
  tree.id = "workspace-tree";
  const preferredWidth = state.layouts[currentOrientation]?.[win.id]?.width ?? win.baseWidth;
  Object.assign(win, {fileFrame: frame, fileAddress: address, fileTree: tree, fileFolders: folders,
    fileTreeOpen: Math.min(preferredWidth, innerWidth - 10) > 550, fileTreeNodes: new Map(), fileTreeExpanded: new Set([""]),
    fileTreePending: new Set(), filePreview: preview, fileView: state.explorerView,
    fileListHeading: heading, fileSort: {column: "name", descending: false}});
  frame.dataset.view = win.fileView;
  heading.hidden = win.fileView !== "details";
  preview.hidden = win.fileView !== "web";
  tree.hidden = true;
  return {location, frame, folders};
}

function refreshExplorerFrame(win, snapshot, navigated) {
  if (document.activeElement !== win.fileAddress || navigated) win.fileAddress.value = snapshot.path || workspaceAddress();
  if (navigated) win.fileFocus = null;
  if (snapshot.local && typeof snapshot.key === "string") {
    const parts = snapshot.key ? snapshot.key.split("/") : [];
    for (let depth = 0; depth <= parts.length; depth++) {
      win.fileTreeExpanded.add(parts.slice(0, depth).join("/"));
    }
    win.fileTreeNodes.set(snapshot.key, snapshot.entries.filter(row => row.folder && row.key)
      .map(row => ({name: row.name, key: row.key})));
  }
  updateExplorerTree(win);
}

function updateExplorerTree(win) {
  const snapshot = win.fileSnapshot;
  const tree = win.fileTree;
  const visible = Boolean(snapshot?.local && win.fileTreeOpen);
  tree.hidden = !visible;
  win.fileFolders.disabled = !snapshot?.local;
  win.fileFolders.setAttribute("aria-expanded", String(visible));
  if (!visible) return;
  const shown = [];
  function visit(key, name, depth) {
    const children = win.fileTreeNodes.get(key);
    const expanded = win.fileTreeExpanded.has(key);
    if (expanded && !children && !win.fileTreePending.has(key)) {
      win.fileTreePending.add(key);
      fileCommand("tree", key);
    }
    const indent = element("div", "explorer-tree-row");
    indent.style.paddingLeft = Math.min(10, depth) * 12 + "px";
    const toggle = button(expanded ? "−" : "+", () => {
      if (expanded) win.fileTreeExpanded.delete(key);
      else win.fileTreeExpanded.add(key);
      updateExplorerTree(win);
    }, "tree-expand");
    toggle.setAttribute("aria-label", (expanded ? "Collapse " : "Expand ") + name);
    toggle.disabled = !!children && !children.length;
    const go = button(null, () => {
      if (win.fileFrame.clientWidth <= 500) {
        win.fileTreeOpen = false;
        updateExplorerTree(win);
      }
      fileCommand("goto", key);
    }, "tree-folder");
    go.append(retroIcon(key === "" ? "disk" : "folder", 16), element("span", "", name));
    if (key === snapshot.key) go.setAttribute("aria-current", "location");
    indent.append(toggle, go);
    shown.push(indent);
    if (expanded && children) for (const child of children) visit(child.key, child.name, depth + 1);
  }
  visit("", "Local Disk (C:)", 0);
  tree.replaceChildren(...shown);
}

window.fileTreeState = snapshot => {
  const win = openWindows.get("$files");
  if (!win?.fileTree) return;
  win.fileTreePending.delete(snapshot.key);
  win.fileTreeNodes.set(snapshot.key, snapshot.folders);
  updateExplorerTree(win);
};

function locateExplorerEntry(win, entry) {
  if (entry.folder || win.fileView !== "web" || win.fileFocus === entry.id) {
    fileCommand("open", entry.id);
    return;
  }
  win.fileFocus = entry.id;
  renderFileRows(win);
  const row = [...win.fileRows.querySelectorAll("[data-file]")].find(node => node.dataset.file === entry.id);
  row?.focus({preventScroll: true});
}

function renderFileDetails(win, entry) {
  const preview = win.filePreview;
  if (win.fileView !== "web") return;
  if (entry && preview.dataset.entry === entry.id + "/" + entry.modified) return;
  preview.replaceChildren();
  if (!entry) {
    delete preview.dataset.entry;
    preview.append(element("strong", "", win.fileSnapshot.path || "Local Disk (C:)"),
      element("p", "", "Select a file to see its details."));
    return;
  }
  preview.dataset.entry = entry.id + "/" + entry.modified;
  const label = element("strong", "", entry.name);
  const meta = element("div", "file-preview-meta");
  meta.append(element("span", "", fileKind(entry)));
  const size = fileSize(entry.size);
  const modified = fileDate(entry.modified);
  if (size) meta.append(element("span", "", "Size " + size));
  if (modified) meta.append(element("span", "", "Modified " + modified));
  preview.append(label, meta, toolbarButton("Open", () => fileCommand("open", entry.id)));
  if (entry.type?.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp)$/i.test(entry.name)) {
    fileCommand("preview", entry.id);
  }
}

window.fileThumbnail = result => {
  const win = openWindows.get("$files");
  if (win?.fileView !== "web" || win.fileFocus !== result.id || !/^[A-Za-z0-9+/]+=*$/.test(result.image)) return;
  const picture = element("img", "explorer-thumbnail");
  picture.src = "data:image/jpeg;base64," + result.image;
  picture.alt = "File thumbnail";
  win.filePreview.querySelector("img")?.remove();
  win.filePreview.append(picture);
};

function displayFiles(entries, sort) {
  const {column, descending} = sort;
  const direction = descending ? -1 : 1;
  return [...entries].sort((first, second) => {
    if (first.folder !== second.folder) return first.folder ? -1 : 1;
    const value = column === "type" ? fileKind(first).localeCompare(fileKind(second)) :
      column === "size" || column === "modified" ? (first[column] || 0) - (second[column] || 0) :
        first.name.localeCompare(second.name);
    return direction * value || first.name.localeCompare(second.name);
  });
}

function renderFindFiles(win) {
  const search = element("form", "explorer-address find-address");
  const label = element("label", "", "Named");
  label.htmlFor = "find-file-name";
  const input = element("input", "text-entry");
  input.id = label.htmlFor;
  input.type = "search";
  input.maxLength = 100;
  input.autocomplete = "off";
  input.placeholder = "File or folder name";
  const go = element("button", "bevel tool-button", "Find Now");
  go.type = "submit";
  const results = element("div", "explorer file-rows find-results");
  const status = appStatus("Look in Local Disk (C:)");
  search.append(label, input, go);
  input.required = true;
  search.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    if (!native?.fileCommand) {
      status.textContent = "Workspace search is available in the Android launcher.";
      return;
    }
    win.fileSearchRequest = String(++fileSearchSequence);
    results.replaceChildren();
    status.textContent = "Searching…";
    fileCommand("find", JSON.stringify({query, id: win.fileSearchRequest}));
  });
  win.fileSearchRows = results;
  win.fileSearchStatus = status;
  win.body.replaceChildren(search, results, status);
}

window.fileSearchState = snapshot => {
  const win = openWindows.get("$find-files");
  if (!win || win.fileSearchRequest !== snapshot.id) return;
  const entries = snapshot.entries;
  win.fileSearchRows.replaceChildren(...entries.map(entry => {
    const row = fileRow(entry.name, entry.folder, () => {
      if (entry.folder) openWindow("files");
      fileCommand("open-catalog", entry.key);
    }, entry.zip ? "zip" : "");
    row.append(element("small", "find-path", entry.parent));
    return row;
  }));
  if (!entries.length) win.fileSearchRows.append(element("p", "empty-note", "No files or folders matched."));
  win.fileSearchStatus.textContent = objectCount(entries.length) + (snapshot.limited ? " · Refine your search for more results." : "");
};
