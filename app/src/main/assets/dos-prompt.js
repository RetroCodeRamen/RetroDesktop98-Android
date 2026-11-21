"use strict";

let dosSequence = 0;
const dosHistory = [];

function renderDosPrompt(win) {
  const pane = element("div", "terminal-pane dos-pane");
  const output = element("pre", "tty-display sunken dos-output");
  output.tabIndex = 0;
  output.setAttribute("aria-label", "DOS output");
  const form = element("form", "terminal-input");
  const address = element("span", "dos-address");
  const input = element("input", "text-entry");
  input.type = "text";
  input.maxLength = 1024;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.enterKeyHint = "go";
  input.setAttribute("aria-label", "DOS command");
  const run = element("button", "bevel tool-button", "Enter");
  run.type = "submit";
  form.append(address, input, run);

  let cwd = "", busy = "", pendingCompletion = "", draft = "", historySlot = dosHistory.length;
  let lines = ["Retro Desktop 98 [Version 2.4]\nType HELP for available commands."];
  let candidates = [], candidate = -1, completionDirection = 1;
  const toolbar = element("div", "app-toolbar terminal-toolbar");
  toolbar.append(toolbarButton("Tab", () => complete()), toolbarButton("↑ Previous", () => recall(-1)),
    toolbarButton("↓ Next", () => recall(1)), toolbarButton("Help", () => submit("HELP")));

  function display() {
    address.textContent = workspaceAddress(cwd) + ">";
    address.scrollLeft = address.scrollWidth;
    output.textContent = lines.join("\n");
    output.scrollTop = output.scrollHeight;
    run.disabled = !!busy;
    input.readOnly = !!busy;
  }

  function submit(text) {
    if (busy || !text.trim()) return;
    const command = text.trim();
    if (dosHistory.at(-1) !== command) dosHistory.push(command);
    if (dosHistory.length > 80) dosHistory.shift();
    draft = "";
    historySlot = dosHistory.length;
    lines.push(address.textContent + command);
    input.value = "";
    resetCompletion();
    if (!native?.fileCommand) {
      lines.push("The C: workspace is available in the Android launcher.");
    } else {
      busy = String(++dosSequence);
      fileCommand("dos", JSON.stringify({id:busy, cwd, line:command, kind:"run"}));
    }
    display();
  }

  function recall(direction) {
    if (busy) return;
    if (historySlot === dosHistory.length) draft = input.value;
    historySlot = Math.max(0, Math.min(dosHistory.length, historySlot + direction));
    input.value = historySlot === dosHistory.length ? draft : dosHistory[historySlot];
    resetCompletion();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function resetCompletion() {
    pendingCompletion = "";
    candidates = [];
    candidate = -1;
  }

  function complete(direction = 1) {
    if (busy || !native?.fileCommand) return;
    if (candidates.length) {
      candidate = (candidate + direction + candidates.length) % candidates.length;
      input.value = candidates[candidate];
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    completionDirection = direction;
    pendingCompletion = String(++dosSequence);
    fileCommand("dos", JSON.stringify({id:pendingCompletion, cwd, line:input.value, kind:"complete"}));
  }

  form.addEventListener("submit", event => { event.preventDefault(); submit(input.value); });
  input.addEventListener("input", resetCompletion);
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      recall(event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      complete(event.shiftKey ? -1 : 1);
    }
  });

  win.dosResult = result => {
    if (result.kind === "complete" && pendingCompletion === result.id) {
      pendingCompletion = "";
      candidates = result.candidates || [];
      if (candidates.length) {
        if (completionDirection < 0) candidate = 0;
        complete(completionDirection);
      }
      return;
    }
    if (busy !== result.id || result.kind === "complete") return;
    busy = "";
    cwd = result.cwd || "";
    if (result.exit) { closeWindow(win.id); return; }
    if (result.clear) lines = [];
    if (result.text) lines.push(result.text);
    lines = lines.slice(-150);
    // Keep recent commands visible if TYPE opened a long document.
    let size = lines.reduce((total, line) => total + line.length, 0);
    while (lines.length > 1 && size > 210000) size -= lines.shift().length;
    display();
  };
  pane.append(toolbar, output, form);
  win.body.replaceChildren(pane);
  display();
}

window.dosResult = result => openWindows.get("$dos")?.dosResult?.(result);
