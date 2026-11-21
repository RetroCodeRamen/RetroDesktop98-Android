"use strict";

let luaPrograms = new Map();
const runningLuaPrograms = new Map();

function isLuaProgramId(id) {
  return typeof id === "string" && /^lua-user-[a-f0-9]{32}$/.test(id);
}

function refreshLuaPrograms() {
  let catalog;
  try {
    catalog = JSON.parse(native?.listLuaPrograms?.() || "[]");
    if (!Array.isArray(catalog)) return;
  } catch (error) {
    return;
  }
  const entries = catalog.filter(item => isLuaProgramId(item?.id) && typeof item.name === "string" && item.name)
    .sort((first, second) => first.name.localeCompare(second.name))
    .map(item => [item.id, {...item, art: "lua", group: "Lua Programs", builtin: true, published: true}]);
  if (JSON.stringify([...luaPrograms.values()]) === JSON.stringify(entries.map(([, app]) => app))) return;
  luaPrograms = new Map(entries);
  renderDesktop();
  updateQuickLaunch();
  for (const win of openWindows.values()) {
    if (win.kind === "programs") renderProgramRows(win);
    if (win.kind === "folder" || win.kind === "recycle") renderExplorer(win);
  }
}

function readPublishedLua(id) {
  try {
    const saved = native?.readLuaProgram?.(id);
    if (!saved) throw Error("That Lua program is unavailable.");
    return luaProject(JSON.parse(saved));
  } catch (error) {
    announce("That Lua program is unavailable.");
    refreshLuaPrograms();
    return null;
  }
}

function startPublishedLua(app) {
  const previous = runningLuaPrograms.get(app.id);
  if (previous?.activate()) return;
  const project = readPublishedLua(app.id);
  if (!project || !native?.luaCommand) return;
  if (activeLuaProjects.size >= 5) {
    announce("Close a Lua program before opening another.");
    return;
  }
  const program = launchLuaProject(project, {
    storageId: app.id,
    closeOnError: true,
    onError: message => announce(app.name + " · " + message.split("\n")[0]),
    onEnd: () => {
      if (runningLuaPrograms.get(app.id) === program) runningLuaPrograms.delete(app.id);
    }
  });
  runningLuaPrograms.set(app.id, program);
  program.start();
}

function editPublishedLua(app) {
  const project = readPublishedLua(app.id);
  if (project) openWindow("lua-studio").loadLuaStudioFile(project, app.id);
}

function removePublishedLua(app) {
  dialog({
    kind: "lua-unpublish", title: "Remove Lua Program", icon: "lua",
    message: "Remove “" + app.name + "” from Programs and remove its desktop and folder shortcuts?",
    accept: "Remove", cancel: "Cancel", onAccept: () => {
      if (!native?.removeLuaProgram?.(app.id)) {
        announce("Could not remove this Lua program.");
        refreshLuaPrograms();
        return;
      }
      runningLuaPrograms.get(app.id)?.stop();
      try { localStorage.removeItem("retro98-lua-storage:" + app.id); } catch (error) {}
      state.items = state.items.filter(item => !(item.type === "builtin" && item.target === app.id));
      if (selected && !itemById(selected.id)) selectItem(null, null);
      applyState();
      refreshLuaPrograms();
      announce("Lua program removed.");
    }
  });
}
