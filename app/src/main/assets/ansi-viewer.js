"use strict";

function parseAnsiArt(buffer, encoding) {
  const bytes = Uint8Array.from(atob(buffer), value => value.charCodeAt(0));
  let end = bytes.length;
  let title = "", author = "", width = TERMINAL_COLS, iceColors = false;
  const record = end - 128;
  if (record >= 0 && decodeDosBytes(bytes.subarray(record, record + 7)) === "SAUCE00") {
    end = record;
    const comments = bytes[record + 104];
    const start = end - comments * 64 - 5;
    if (comments && start >= 0 && decodeDosBytes(bytes.subarray(start, start + 5)) === "COMNT") end = start;
    title = decodeDosBytes(bytes.subarray(record + 7, record + 42)).replace(/\p{Cc}/gu, "").trim();
    author = decodeDosBytes(bytes.subarray(record + 42, record + 62)).replace(/\p{Cc}/gu, "").trim();
    if (bytes[record + 94] === 1) {
      iceColors = (bytes[record + 105] & 1) !== 0;
      const columns = bytes[record + 96] | (bytes[record + 97] << 8);
      if (columns >= 20 && columns <= 160) width = columns;
    }
  }
  if (bytes[end - 1] === 0x1a) end--;
  const data = bytes.subarray(0, end);
  const utf8 = encoding === "utf8" || (encoding !== "cp437" && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf);
  const text = utf8 ? new TextDecoder().decode(data) : decodeDosBytes(data);
  return {title, author, width, iceColors, text: text.replace(/\r\n|\n/g, "\r\n")};
}

function renderAnsiViewer(win) {
  const pane = element("div", "terminal-pane");
  const toolbar = element("div", "app-toolbar terminal-toolbar");
  const view = element("div", "tty-display sunken ansi-display");
  view.setAttribute("aria-label", "ANSI artwork");
  view.tabIndex = 0;
  const status = appStatus("Open an .ANS file or try the sample.");
  const encoding = element("select", "text-entry");
  encoding.setAttribute("aria-label", "Character set");
  encoding.add(new Option("Automatic", "auto"));
  encoding.add(new Option("DOS / CP437", "cp437"));
  encoding.add(new Option("UTF-8", "utf8"));
  let fit = true, documentData, columns = TERMINAL_COLS;
  const fitButton = toolbarButton("Fit Width", () => { fit = !fit; resize(); });
  const sampleButton = toolbarButton("Sample", () => {
    documentData = null;
    const sample = new TerminalScreen();
    offlineTerminalBoard(sample, "2");
    draw(sample, "ANSI Gallery · Built-in sample");
  });
  toolbar.append(toolbarButton("Open ANSI File…", () => native?.desktopFile?.("open-ansi", "", "")),
    sampleButton, fitButton, encoding);

  function resize() {
    const pixels = fit ? Math.min(16, Math.max(5, (view.clientWidth - 14) / (columns * .61))) :
      view.clientWidth < 450 ? 12 : 14;
    view.style.fontSize = pixels + "px";
    fitButton.setAttribute("aria-pressed", String(fit));
  }

  function draw(screen, details) {
    columns = screen.columns;
    const rows = [...screen.history, ...screen.grid];
    while (rows.length && !rows.at(-1).some(cell => cell && (cell.text !== " " || cell.style?.paper || cell.style?.brightPaper))) rows.pop();
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.append(drawTerminalLine(row));
    view.replaceChildren(fragment);
    view.scrollTo(0, 0);
    status.textContent = details + (screen.trimmedHistory ? " · Showing the last " + rows.length + " rows" : "");
    resize();
  }

  function renderDocument() {
    if (!documentData) return;
    try {
      const art = parseAnsiArt(documentData.data, encoding.value);
      const screen = new TerminalScreen(undefined, {columns:art.width, historyLimit:1600, iceColors:art.iceColors});
      screen.put(art.text);
      const details = [documentData.name, art.title, art.author && "by " + art.author].filter(Boolean).join(" · ");
      draw(screen, details);
    } catch (error) {
      status.textContent = "Could not read this ANSI artwork.";
    }
  }

  encoding.addEventListener("change", renderDocument);
  win.loadAnsi = file => {
    documentData = file;
    renderDocument();
  };
  pane.append(toolbar, view, status);
  win.body.replaceChildren(pane);
  const observer = new ResizeObserver(resize);
  observer.observe(view);
  win.cleanup = () => observer.disconnect();
  resize();
}

window.desktopAnsi = file => openWindow("ansi-viewer").loadAnsi(file);
