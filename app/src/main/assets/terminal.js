"use strict";

const CP437_HIGH = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

const LINE_END = {crlf: "\r\n", cr: "\r", lf: "\n"};
const TERMINAL_ARROWS = {ArrowUp:"A", ArrowDown:"B", ArrowRight:"C", ArrowLeft:"D"};
const TERMINAL_KEYS = {Backspace:"\x7f", Tab:"\t", Escape:"\x1b", Delete:"\x1b[3~", Insert:"\x1b[2~",
  Home:"\x1b[H", End:"\x1b[F", PageUp:"\x1b[5~", PageDown:"\x1b[6~", F1:"\x1bOP", F2:"\x1bOQ", F3:"\x1bOR", F4:"\x1bOS"};
let terminalSequence = 0;

function terminalToken(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + (++terminalSequence);
}

function decodeDosBytes(bytes) {
  return Array.from(bytes, code => code < 128 ? String.fromCharCode(code) : CP437_HIGH[code - 128]).join("");
}

function encodeTerminal(text, encoding) {
  if (encoding === "utf8") return new TextEncoder().encode(text);
  return Uint8Array.from([...text], point => {
    if (point.codePointAt(0) < 128) return point.codePointAt(0);
    const byte = CP437_HIGH.indexOf(point);
    return byte < 0 ? 63 : byte + 128;
  });
}

function terminalBinary(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function terminalConnection(profile) {
  const host = String(profile?.host || "").trim();
  if (!/^(?:[a-z0-9.:_-]{1,253}|\[[0-9a-f:.]{1,60}\])$/i.test(host)) return null;
  const port = Number(profile.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host, port, transport: profile.transport === "tcp" ? "tcp" : "telnet",
    encoding: profile.encoding === "utf8" ? "utf8" : "cp437",
    ending: Object.prototype.hasOwnProperty.call(LINE_END, profile.ending) ? profile.ending : "crlf"
  };
}

function terminalDirectory() {
  try {
    const saved = JSON.parse(native?.loadTerminalDirectory?.() ?? localStorage.getItem("retro98-terminal-directory") ?? "[]");
    if (Array.isArray(saved)) return saved.slice(0, 30).flatMap(entry => {
      const profile = terminalConnection(entry);
      if (!profile || typeof entry.title !== "string" || !entry.title.trim() ||
          !/^[a-z0-9-]{1,45}$/.test(entry.id)) return [];
      return [{...profile, id:entry.id, title:entry.title.trim().slice(0, 45)}];
    });
  } catch (error) { }
  return [];
}

function writeTerminalDirectory(entries) {
  const data = JSON.stringify(entries);
  if (native?.saveTerminalDirectory) native.saveTerminalDirectory(data);
  else localStorage.setItem("retro98-terminal-directory", data);
}

function renderTerminalConnect(win) {
  const terminal = win.options.terminal;
  const form = element("form", "window-form terminal-connect");
  const directory = element("select", "text-entry");
  const name = element("input", "text-entry");
  const host = element("input", "text-entry");
  const port = element("input", "text-entry");
  const transport = element("select", "text-entry");
  const encoding = element("select", "text-entry");
  const ending = element("select", "text-entry");
  const fields = element("div", "terminal-fields");
  const status = element("p", "form-error");
  status.setAttribute("role", "status");
  function field(label, input) {
    const row = element("label", "form-label");
    row.append(element("span", "", label), input);
    fields.append(row);
  }
  name.maxLength = 45;
  host.maxLength = 255;
  host.autocomplete = "off";
  host.spellcheck = false;
  host.placeholder = "Hostname or IP address";
  port.type = "number";
  port.min = "1";
  port.max = "65535";
  port.inputMode = "numeric";
  transport.add(new Option("Telnet", "telnet"));
  transport.add(new Option("Raw TCP", "tcp"));
  encoding.add(new Option("DOS / CP437", "cp437"));
  encoding.add(new Option("UTF-8", "utf8"));
  ending.add(new Option("CR + LF", "crlf"));
  ending.add(new Option("CR", "cr"));
  ending.add(new Option("LF", "lf"));
  field("Saved connections", directory);
  field("Connection name", name);
  field("Host", host);
  field("Port", port);
  field("Protocol", transport);
  field("Character set", encoding);
  field("Enter sends", ending);

  let saved = terminalDirectory();
  const read = () => terminalConnection({host:host.value, port:port.value, transport:transport.value,
    encoding:encoding.value, ending:ending.value});
  function fill(profile) {
    name.value = profile?.title || "";
    host.value = profile?.host || "";
    port.value = profile?.port || 23;
    transport.value = profile?.transport || "telnet";
    encoding.value = profile?.encoding || "cp437";
    ending.value = profile?.ending || "crlf";
  }
  function rebuild(id = "") {
    directory.replaceChildren(new Option("(New connection)", ""));
    for (const entry of saved) directory.add(new Option(entry.title, entry.id));
    directory.value = id;
  }
  directory.addEventListener("change", () => {
    fill(saved.find(entry => entry.id === directory.value));
    remove.disabled = !directory.value;
    status.textContent = "";
  });
  const save = toolbarButton("Save Connection", () => {
    const next = read();
    const title = name.value.trim();
    if (!next || !title) {
      status.textContent = "Enter a connection name, host and port first.";
      return;
    }
    const id = directory.value || saved.find(entry => entry.title.toLowerCase() === title.toLowerCase())?.id
      || terminalToken("profile");
    if (saved.length >= 30 && !saved.some(entry => entry.id === id)) {
      status.textContent = "Remove a saved connection before adding another.";
      return;
    }
    saved = [...saved.filter(entry => entry.id !== id), {...next, title, id}].sort((a, b) => a.title.localeCompare(b.title));
    writeTerminalDirectory(saved);
    rebuild(id);
    remove.disabled = false;
    status.textContent = "Connection saved.";
  });
  const remove = toolbarButton("Remove", () => {
    if (!directory.value) return;
    saved = saved.filter(entry => entry.id !== directory.value);
    writeTerminalDirectory(saved);
    rebuild();
    fill();
    remove.disabled = true;
    status.textContent = "Connection removed.";
  });
  remove.disabled = true;
  rebuild();
  fill(terminal.terminalLastProfile);
  const options = element("div", "app-toolbar");
  options.append(save, remove);
  form.append(fields, options, element("small", "", "Telnet and raw TCP send unencrypted data."), status);
  formActions(form, "Connect", "Cancel", () => closeWindow(win.id));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const next = read();
    if (!next) {
      status.textContent = "Enter a hostname or IP address and a port from 1 to 65535.";
      return;
    }
    if (!native?.terminalCommand) {
      status.textContent = "Network connections are available in the Android launcher.";
      return;
    }
    terminal.terminalConnect({...next, title: name.value.trim()});
    closeWindow(win.id);
  });
  win.body.replaceChildren(form);
}

function copyDesktopText(text) {
  if (native?.copyDesktopText) {
    native.copyDesktopText(text);
    announce("Copied to the clipboard.");
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => announce("Copied to the clipboard."))
      .catch(() => announce("Select the text and use your browser’s Copy command."));
  } else announce("Select the text and use your browser’s Copy command.");
}

function drawTerminalLine(row, cursor = -1) {
  const line = element("div", "tty-line");
  let span, current, previousCursor = false, text = "";
  for (let index = 0; index < row.length; index++) {
    const cell = row[index];
    if (cell?.continuation) continue;
    const style = cell?.style || TERM_STYLE;
    const active = index === cursor || (cell?.width === 2 && index + 1 === cursor);
    if (!span || current !== style || active !== previousCursor) {
      if (span) span.textContent = text;
      text = "";
      current = style;
      previousCursor = active;
      span = element("span", active ? "tty-cursor" : "");
      const paperIndex = style.brightPaper ? (style.paper ? TERM_COLORS.indexOf(style.paper) : 0) : -1;
      const paper = paperIndex >= 0 && paperIndex < 8 ? TERM_COLORS[paperIndex + 8] : style.paper;
      if (style.inverse) {
        span.style.color = paper || "var(--tty-bg)";
        span.style.backgroundColor = style.ink || "var(--tty-ink)";
      } else {
        if (style.ink) {
          const indexOfColor = TERM_COLORS.indexOf(style.ink);
          span.style.color = style.bold && indexOfColor >= 0 && indexOfColor < 8 ? TERM_COLORS[indexOfColor + 8] : style.ink;
        }
        if (paper) span.style.backgroundColor = paper;
      }
      if (style.underline) span.style.textDecoration = "underline";
      line.append(span);
    }
    text += cell?.text || " ";
  }
  if (span) span.textContent = text;
  return line;
}

function offlineTerminalBoard(screen, answer = "menu") {
  const title = "RETRO DESKTOP BBS";
  const subtitle = " · Local Demo";
  const inside = 39;
  const border = "═".repeat(inside);
  const board = "\x1b[2J\x1b[H\x1b[96m╔" + border + "╗\r\n║ \x1b[97m" + title +
    "\x1b[96m" + subtitle + " ".repeat(inside - title.length - subtitle.length - 1) +
    "║\r\n╚" + border + "╝\x1b[0m\r\n\r\n";
  const contents = {
    menu: "\x1b[93m[1]\x1b[0m Bulletin      \x1b[93m[2]\x1b[0m ANSI Gallery\r\n" +
      "\x1b[93m[3]\x1b[0m About         \x1b[93m[Q]\x1b[0m Log off\r\n\r\nBoard> ",
    "1": "\x1b[93mBULLETIN 01\x1b[0m\r\n\r\nYou reached the board without a modem,\r\nan account, or a network connection.\r\nTry the ANSI gallery next.\r\n\r\n" +
      "Press Enter for the main menu. ",
    "2": "\x1b[95mANSI GALLERY\x1b[0m\r\n\r\n" +
      "\x1b[94m        ░░▒▓█\x1b[96m██\x1b[97m██\x1b[96m██\x1b[94m█▓▒░░\r\n" +
      "     ░▒▓\x1b[95m█████████████\x1b[94m▓▒░\r\n" +
      "  ──────────────────────────────\x1b[0m\r\n\r\n" +
      "Press Enter for the main menu. ",
    "3": "\x1b[93mABOUT\x1b[0m\r\n\r\nThe same 80-column screen can show art\r\nfrom a Telnet or raw TCP connection.\r\nUse Character Map to make ANSI borders.\r\n\r\nPress Enter for the main menu. ",
    quit: "You have logged off the offline board.\r\n"
  };
  screen.put(board + (contents[answer] || contents.menu));
}

function renderHyperTerminal(win) {
  const pane = element("div", "terminal-pane");
  const view = element("div", "tty-display sunken");
  view.setAttribute("role", "region");
  view.setAttribute("aria-label", "Terminal screen");
  view.tabIndex = 0;
  const history = element("div", "tty-history");
  const active = element("div", "tty-active");
  view.append(history, active);
  const status = appStatus("Disconnected");
  const form = element("form", "terminal-input");
  const input = element("textarea", "text-entry tty-input");
  input.rows = 1;
  input.spellcheck = false;
  input.maxLength = 2600;
  input.autocomplete = "off";
  input.enterKeyHint = "send";
  input.setAttribute("aria-label", "Terminal input");
  input.placeholder = "Type a line";
  const send = element("button", "bevel tool-button", "Send");
  send.type = "submit";
  form.append(input, send);

  let session = "", phase = "idle", profile = null, remoteEcho = false, reader;
  let live = false, echo = false, fit = false, frame = 0, lastHistory = 0, cursorBottom = 0, saveId = "";
  let demoPage = false;
  const screen = new TerminalScreen(text => { if (phase === "online") sendRemote(text); });
  const toolbar = element("div", "app-toolbar terminal-toolbar");
  const connect = toolbarButton("Connect…", () => openWindow("terminal-connect", "$terminal-connect", {terminal:win}));
  const disconnect = toolbarButton("Disconnect", stop);
  const demo = toolbarButton("Offline BBS", () => {
    screen.reset();
    phase = "demo";
    demoPage = false;
    live = false;
    offlineTerminalBoard(screen);
    view.scrollTop = cursorBottom = 0;
    status.textContent = "Offline BBS";
    refresh();
    paint();
  });
  const liveKeys = toolbarButton("Live Keys", () => {
    live = !live;
    refresh();
    input.focus();
  });
  const echoButton = toolbarButton("Local Echo", () => { echo = !echo; refresh(); });
  const fitButton = toolbarButton("Fit 80 Columns", () => { fit = !fit; resize(); });
  const keyButton = toolbarButton("Keys", () => {
    if (menu?.anchor === keyButton) { closeMenu(); return; }
    const bounds = keyButton.getBoundingClientRect();
    const special = [
      ["Enter", LINE_END[profile.ending]], ["Tab", "\t"], ["Esc", "\x1b"], ["Backspace", "\x7f"],
      ["Ctrl+C", "\x03"], ["Ctrl+D", "\x04"], ["Up", arrow("ArrowUp")], ["Down", arrow("ArrowDown")],
      ["Left", arrow("ArrowLeft")], ["Right", arrow("ArrowRight")], ["F1", TERMINAL_KEYS.F1]
    ];
    showMenu(special.map(([label, value]) => [label, "", () => sendRemote(value, true)]),
      bounds.left, bounds.bottom, keyButton);
  });
  const file = windowMenu("File", [
    ["Connect…", "terminal", () => connect.click()],
    ["Offline BBS", "terminal", () => demo.click()],
    ["Save Transcript…", "paper", () => {
      const transcript = screen.text();
      if (!transcript || saveId) return;
      if (!native?.desktopFile) { announce("Use the Android launcher to save a transcript."); return; }
      nameDialog("Save Transcript", "HyperTerminal.txt", value => {
        saveId = terminalToken("terminal");
        const filename = /\.txt$/i.test(value) ? value : value + ".txt";
        native.desktopFile("save-note", saveId, JSON.stringify({name:filename, text:transcript.slice(-150000)}));
      }, 90);
    }],
    null, ["Close", "", () => closeWindow(win.id)]
  ]);
  const edit = windowMenu("Edit", [
    ["Copy Screen", "", () => copyDesktopText(screen.text(false))],
    ["Clear Screen", "", () => {
      screen.clearDisplay();
      view.scrollTop = cursorBottom = 0;
      paint();
    }],
    ["Character Map", "charmap", () => openWindow("charmap")]
  ]);
  const menuBar = element("nav", "window-menubar");
  menuBar.append(file, edit);
  toolbar.append(connect, disconnect, demo, keyButton, liveKeys, echoButton, fitButton);

  function refresh() {
    const connected = phase === "online";
    const busy = connected || phase === "dialing";
    connect.disabled = demo.disabled = busy;
    disconnect.disabled = !busy && phase !== "demo";
    input.disabled = phase === "dialing";
    send.disabled = !connected && phase !== "demo";
    liveKeys.disabled = echoButton.disabled = keyButton.disabled = !connected;
    input.placeholder = live ? "Keys are sent as you type" : phase === "demo" ? "Enter a menu option" : "Type a line";
    liveKeys.setAttribute("aria-pressed", String(live));
    echoButton.setAttribute("aria-pressed", String(echo));
  }

  function paint() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const follow = view.scrollTop + view.clientHeight + 20 >= cursorBottom;
      if (screen.historyVersion !== lastHistory) {
        history.replaceChildren(...(screen.alt ? [] : screen.history.map(row => drawTerminalLine(row))));
        lastHistory = screen.historyVersion;
      }
      active.replaceChildren(...screen.grid.map((row, y) => drawTerminalLine(row, screen.cursor && y === screen.y ? screen.x : -1)));
      const rowHeight = active.offsetHeight / TERMINAL_ROWS;
      cursorBottom = active.offsetTop + (screen.y + 1) * rowHeight;
      if (follow) view.scrollTop = Math.max(0, cursorBottom - view.clientHeight + 8);
    });
  }

  function resize() {
    const pixels = fit ? Math.min(15, Math.max(6, (view.clientWidth - 14) / 48.4)) :
      view.clientWidth < 450 ? 12 : 14;
    view.style.fontSize = pixels + "px";
    fitButton.setAttribute("aria-pressed", String(fit));
  }

  function arrow(key) {
    return (screen.applicationCursor ? "\x1bO" : "\x1b[") + TERMINAL_ARROWS[key];
  }

  function sendRemote(text, local = false) {
    if (phase !== "online" || !text) return;
    const bytes = encodeTerminal(text, profile.encoding);
    if (bytes.length > 8192) { status.textContent = "Send a smaller block of text."; return; }
    native?.terminalCommand?.("send", session, terminalBinary(bytes));
    if (local && echo && !remoteEcho) {
      screen.put(text === "\x7f" ? "\b \b" : text.replace(/\r\n?|\n/g, "\r\n"));
      paint();
    }
  }

  function sendLine() {
    if (phase !== "demo" && phase !== "online") return;
    const value = input.value;
    input.value = "";
    if (phase === "demo") {
      const answer = value.trim().toLowerCase();
      if (answer === "q" || answer === "quit") {
        offlineTerminalBoard(screen, "quit");
        phase = "idle";
        status.textContent = "Offline BBS ended.";
      } else {
        if (demoPage) offlineTerminalBoard(screen);
        else if (["1", "2", "3"].includes(answer)) offlineTerminalBoard(screen, answer);
        else if (answer) screen.put("\r\nChoose 1, 2, 3 or Q.\r\nBoard> ");
        demoPage = !demoPage && ["1", "2", "3"].includes(answer);
      }
      refresh();
      paint();
    } else if (phase === "online") sendRemote(value.replace(/\r\n?|\n/g, LINE_END[profile.ending]) + LINE_END[profile.ending], true);
  }

  function stop() {
    if (phase === "dialing" || phase === "online") {
      native?.terminalCommand?.("disconnect", session, "");
      live = false;
      session = "";
    }
    if (phase === "demo") demoPage = false;
    phase = "idle";
    status.textContent = "Disconnected";
    refresh();
  }

  form.addEventListener("submit", event => { event.preventDefault(); sendLine(); });
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      sendLine();
    } else if (live && phase === "online") {
      const letter = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase().charCodeAt(0) - 64 : 0;
      const raw = event.ctrlKey && !event.altKey && letter ? String.fromCharCode(letter) :
        TERMINAL_ARROWS[event.key] ? arrow(event.key) : TERMINAL_KEYS[event.key];
      if (raw) {
        event.preventDefault();
        event.stopPropagation();
        sendRemote(raw, true);
      }
    }
  });
  function flushLiveText() {
    if (!live || phase !== "online" || !input.value) return;
    const text = input.value;
    input.value = "";
    sendRemote(text.replace(/\r\n?|\n/g, LINE_END[profile.ending]), true);
  }
  input.addEventListener("input", event => { if (!event.isComposing) flushLiveText(); });
  input.addEventListener("compositionend", flushLiveText);

  win.terminalConnect = next => {
    if (phase === "online" || phase === "dialing") return;
    profile = next;
    win.terminalLastProfile = next;
    screen.reset();
    view.scrollTop = cursorBottom = 0;
    reader = new TextDecoder("utf-8");
    remoteEcho = false;
    demoPage = false;
    live = false;
    session = terminalToken("call");
    phase = "dialing";
    status.textContent = "Connecting…";
    refresh();
    paint();
    native.terminalCommand("connect", session, JSON.stringify(profile));
  };
  win.terminalEvent = event => {
    if (!session || event.id !== session) return;
    switch (event.status) {
      case "data": {
        const bytes = Uint8Array.from(atob(event.data), letter => letter.charCodeAt(0));
        screen.put(profile.encoding === "utf8" ? reader.decode(bytes, {stream:true}) :
          decodeDosBytes(bytes));
        paint();
        return;
      }
      case "echo": remoteEcho = event.echo; return;
      case "connected": phase = "online"; break;
      case "closed":
        if (profile.encoding === "utf8") screen.put(reader.decode());
        session = "";
        phase = "idle";
        live = false;
        paint();
        break;
    }
    refresh();
    if (event.message) status.textContent = event.message;
  };
  win.terminalInsert = text => {
    if (input.disabled) return false;
    live = false;
    input.value = (input.value + text).slice(0, input.maxLength);
    refresh();
    input.focus();
    return true;
  };
  win.terminalSaved = result => {
    if (!saveId || result.id !== saveId) return;
    saveId = "";
    if (result.message) status.textContent = result.message;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(view);
  win.cleanup = () => {
    stop();
    cancelAnimationFrame(frame);
    observer.disconnect();
    if (openWindows.has("$terminal-connect")) closeWindow("$terminal-connect");
  };
  pane.append(menuBar, toolbar, view, form, status);
  win.body.replaceChildren(pane);
  screen.put("\x1b[96mHyperTerminal\x1b[0m\r\nChoose Connect or try the Offline BBS.");
  refresh();
  resize();
  paint();
}

window.hyperTerminalEvent = event => openWindows.get("$terminal")?.terminalEvent?.(event);
