"use strict";

let workspaceClipboard = null;
let workspaceFileSequence = 0;

function workspaceSelection(win, entry) {
  if (!win.fileSnapshot?.local) {
    announce("Open a folder on C: first.");
    return [];
  }
  const rows = win.fileSnapshot.entries.filter(row => win.fileSelected.has(row.id) && row.key);
  if (rows.length && (!entry || win.fileSelected.has(entry.id))) return rows;
  const active = entry || win.fileSnapshot.entries.find(row => row.id === win.fileFocus || row.id === win.fileCurrent);
  if (active?.key) return [active];
  announce("Select a file or folder first.");
  return [];
}

function workspaceCopy(win, action, entry) {
  const entries = workspaceSelection(win, entry);
  if (!entries.length) return;
  if (entries.length > 100) { announce("Select up to 100 items at a time."); return; }
  workspaceClipboard = {action, keys:entries.map(row => row.key)};
  announce((action === "move" ? "Cut " : "Copied ") + objectCount(entries.length) + ". Open the destination and choose Paste.");
}

function workspaceMutate(win, request) {
  if (win.workspaceFilePending) {
    announce("Wait for the current file operation.");
    return;
  }
  if (!native?.fileCommand) { announce("Workspace file operations are available in the Android launcher."); return; }
  const id = String(++workspaceFileSequence);
  const data = JSON.stringify({...request, id});
  if (data.length > 60000) { announce("Select fewer items for this operation."); return; }
  win.workspaceFilePending = id;
  win.workspaceClipboardUsed = workspaceClipboard;
  fileCommand("workspace-mutate", data);
}

function workspacePaste(win) {
  if (!win.fileSnapshot?.local) { announce("Paste into a folder on C:."); return; }
  if (!workspaceClipboard?.keys.length) { announce("Cut or copy a file first."); return; }
  const {action, keys} = workspaceClipboard;
  workspaceMutate(win, {action, sources:keys, destination:win.fileSnapshot.key || ""});
}

function workspaceRename(win, entry) {
  const entries = workspaceSelection(win, entry);
  if (!entries.length) return;
  if (entries.length !== 1) { announce("Select one file or folder to rename."); return; }
  const file = entries[0];
  nameDialog("Rename File or Folder", file.name, name => {
    if (file.name !== name) workspaceMutate(win, {action:"rename", sources:[file.key], name});
  }, 240);
}

function workspaceEditMenu(win, entry) {
  return [
    ["Cut", "", () => workspaceCopy(win, "move", entry)],
    ["Copy", "paper", () => workspaceCopy(win, "copy", entry)],
    ["Paste", "", () => workspacePaste(win)],
    null,
    ["Rename…", "", () => workspaceRename(win, entry)]
  ];
}

window.workspaceCatalogChanged = () => {
  if (openWindows.has("$dos-store")) dosStoreCommand("list");
  const win = openWindows.get("$files");
  if (!win) return;
  win.fileTreeNodes.clear();
  win.fileTreePending.clear();
};

window.workspaceFileResult = result => {
  const win = openWindows.get("$files");
  if (win?.workspaceFilePending === result.id) {
    win.workspaceFilePending = "";
    if (result.action === "move" && workspaceClipboard?.action === "move" &&
        win.workspaceClipboardUsed === workspaceClipboard) {
      const done = new Set(result.done);
      workspaceClipboard.keys = workspaceClipboard.keys.filter(key => !done.has(key));
    }
    win.workspaceClipboardUsed = null;
  }
  const labels = {rename:"Renamed", copy:"Copied", move:"Moved"};
  const completed = result.done.length;
  const firstFailure = result.failed[0]?.message;
  const message = completed ? labels[result.action] + " " + objectCount(completed) + "." : "";
  if (message || firstFailure) announce([message, firstFailure].filter(Boolean).join(" "));
};
