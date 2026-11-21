"use strict";

function dosStoreCommand(action, id = "") {
  native?.dosStoreCommand?.(action, id);
}

function renderDosStore(win) {
  const toolbar = element("div", "app-toolbar");
  toolbar.append(
    toolbarButton("My DOS Games", () => openFileLocation("games")),
    toolbarButton("Import Game…", () => {
      openWindow("dosbox");
      native?.dosBoxCommand?.("choose", "");
    }),
    toolbarButton("GOG Library…", () => system("url", "https://www.gog.com/account"))
  );
  const find = element("input", "text-entry dos-store-search");
  find.type = "search";
  find.placeholder = "Find a game…";
  find.setAttribute("aria-label", "Find a DOS game");
  find.addEventListener("input", () => paintDosStore(win));
  const rows = element("div", "explorer dos-store-games");
  const help = element("details", "dos-store-help");
  help.append(element("summary", "", "Importing a GOG game"),
    element("p", "", "Open GOG Library and sign in there. Under a game, choose its offline backup installer. On a PC, install it and ZIP the original DOS files, then use Import Game… here. Some GOG releases ship only Windows or ScummVM files and require their own player."));
  const status = appStatus(native?.dosStoreCommand ? "Loading games…" : "Open this store in the Android launcher to download games.");
  Object.assign(win, {dosStoreRows:rows, dosStoreSearch:find, dosStoreStatus:status});
  win.body.replaceChildren(toolbar, find, rows, help, status);
  dosStoreCommand("list");
}

function paintDosStore(win) {
  if (!win.dosStoreData) return;
  const {games, downloading, status} = win.dosStoreData;
  const query = win.dosStoreSearch.value.toLowerCase().trim();
  const matches = games.filter(game => [game.title, game.genre, game.edition].some(value => value.toLowerCase().includes(query)));
  const entries = matches.map(game => {
    const entry = element("article", "dos-store-game");
    const title = element("h3", "", game.title);
    const info = element("p", "dos-store-edition", game.genre + " · " + game.edition);
    const copy = element("p", "", game.description);
    const actions = element("div", "dos-store-actions");
    if (game.key) {
      actions.append(toolbarButton("Play", () => playWorkspaceDosGame(game.key)),
        toolbarButton("Desktop Shortcut", () => pinWorkspaceFile({key:game.key, name:game.title + ".zip"}, true)));
    } else if (game.size) {
      const action = downloading === game.id ? "Downloading…" : game.edition === "DOS demo" ? "Get Demo" : "Get Game";
      const install = toolbarButton(action, () => dosStoreCommand("install", game.id));
      install.disabled = !!downloading;
      actions.append(install);
    }
    if (game.gog) actions.append(toolbarButton("View on GOG…", () => system("url", game.gog)));
    if (game.source) actions.append(toolbarButton("Source…", () => system("url", game.source)));
    entry.append(title, info, copy, actions);
    return entry;
  });
  const scroll = win.dosStoreRows.scrollTop;
  win.dosStoreRows.replaceChildren(...(entries.length ? entries : [element("p", "empty-note", "No games match your search.")]));
  win.dosStoreRows.scrollTop = scroll;
  win.dosStoreStatus.textContent = status || `${matches.length} game${matches.length === 1 ? "" : "s"}`;
}

window.dosStoreState = update => {
  const win = openWindows.get("$dos-store");
  if (!win) return;
  win.dosStoreData = update;
  paintDosStore(win);
};
