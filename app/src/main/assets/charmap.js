"use strict";

const characterSets = {
  box: {name:"Box Drawing", text:"─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╒╓╕╖╘╙╛╜╞╟╡╢╤╥╧╨╪╫"},
  dos: {name:"DOS / CP437", text:CP437_HIGH.trimEnd()},
  latin: {name:"Accented Latin", text:"ÀÁÂÃÄÅÆÇÐÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçðèéêëìíîïñòóôõöøùúûüýþÿ"},
  symbols: {name:"Symbols", text:"←↑→↓↔↕↖↗↘↙✓✗★☆♠♣♥♦♪♫●○■□▲▼◆◇░▒▓█▄▌▐▀°±×÷≈≠≤≥∑√∞∫πΩµ¢£¥€©®™"}
};

function characterCode(glyph) {
  return "U+" + glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
}

function renderCharacterMap(win) {
  const form = element("div", "charmap");
  const toolbar = element("div", "app-toolbar");
  const label = element("label", "", "Character set");
  label.htmlFor = "character-set";
  const group = element("select", "text-entry");
  group.id = label.htmlFor;
  for (const [id, set] of Object.entries(characterSets)) group.add(new Option(set.name, id));
  toolbar.append(label, group);
  const grid = element("div", "charmap-grid sunken");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Characters");
  const status = appStatus("");
  const compose = element("div", "app-toolbar");
  const text = element("input", "text-entry");
  text.setAttribute("aria-label", "Characters to copy");
  text.maxLength = 240;
  text.spellcheck = false;
  let selected = "";
  function update() {
    const byte = CP437_HIGH.indexOf(selected);
    status.textContent = selected + " · " + characterCode(selected) +
      (byte >= 0 ? " · CP437 0x" + (byte + 128).toString(16).toUpperCase() : "");
  }
  function fill() {
    const values = [...new Set(characterSets[group.value].text)];
    selected = values[0];
    const buttons = [];
    for (const value of values) {
      const cell = button(value, () => {
        selected = value;
        for (const node of buttons) node.setAttribute("aria-pressed", String(node === cell));
        update();
      }, "bevel charmap-cell");
      cell.title = characterCode(value);
      cell.setAttribute("aria-label", value + " " + characterCode(value));
      cell.setAttribute("aria-pressed", String(value === selected));
      cell.addEventListener("dblclick", () => { text.value = (text.value + selected).slice(0, text.maxLength); });
      buttons.push(cell);
    }
    grid.replaceChildren(...buttons);
    grid.scrollTop = 0;
    update();
  }
  group.addEventListener("change", fill);
  compose.append(toolbarButton("Add", () => { text.value = (text.value + selected).slice(0, text.maxLength); }),
    text, toolbarButton("Copy", () => copyDesktopText(text.value || selected)),
    toolbarButton("Insert in Terminal", () => {
      const terminal = openWindow("terminal");
      if (!terminal.terminalInsert(text.value || selected)) announce("Wait for the connection, then insert the characters.");
    }));
  form.append(toolbar, grid, compose, status);
  win.body.replaceChildren(form);
  fill();
}
