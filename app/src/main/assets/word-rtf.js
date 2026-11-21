"use strict";

const wordLimit = 65000;
const wordFontNames = ["Arial", "Times New Roman", "Courier New"];
const wordNormalStyle = {bold: false, italic: false, underline: false, strike: false, font: 0, size: 11};

function wordFont(name) {
  const family = String(name || "").toLowerCase();
  if (/\b(courier|consolas|mono)/.test(family)) return 2;
  if (/\b(times|georgia|baskerville|serif)/.test(family) && !/sans-serif/.test(family)) return 1;
  return 0;
}

function wordSize(value) {
  return Math.max(6, Math.min(48, Math.round(Number(value) || 11)));
}

function wordSameStyle(a, b) {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline &&
    a.strike === b.strike && a.font === b.font && a.size === b.size;
}

function wordParagraph(kind = "p", align = "left") {
  return {kind, align, runs: []};
}

function parseWordRtf(data) {
  data = data.replace(/^\ufeff/, "").trim();
  if (!/^\{\\rtf\d/.test(data) || data.length > 780000) throw Error("Choose a supported RTF document.");
  const fonts = new Map();
  const decoders = new Map();
  const ignored = new Set(("fonttbl colortbl stylesheet info pict object objdata header footer headerl headerr " +
    "footerl footerr footnote annotation listtable listoverridetable generator filetbl revtbl datastore " +
    "themedata colorschememapping nonshppict shppict shp fldinst xmlopen xmlclose pn").split(" "));
  const symbols = {emdash: "—", endash: "–", emspace: "\u2003", enspace: "\u2002", qmspace: "\u2005",
    bullet: "•", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”"};
  const stack = [];
  const paragraphs = [];
  let paragraph = wordParagraph();
  let chars = 0;
  let skipCharacters = 0;
  let marker = "";
  let fontTableDepth = 0;
  let currentFont = -1;
  let fontName = "";
  let state = {style: {...wordNormalStyle}, uc: 1, codepage: 1252, skip: false, destination: "", starred: false};

  function decoder(codepage) {
    if (!decoders.has(codepage)) {
      let encoding;
      if (codepage === 65001) encoding = "utf-8";
      else if (codepage === 932) encoding = "shift_jis";
      else if (codepage === 936) encoding = "gbk";
      else if (codepage === 949) encoding = "euc-kr";
      else if (codepage === 950) encoding = "big5";
      else encoding = "windows-" + codepage;
      try { decoders.set(codepage, new TextDecoder(encoding)); }
      catch (error) { decoders.set(codepage, new TextDecoder("windows-1252")); }
    }
    return decoders.get(codepage);
  }

  function add(text, fallback = true) {
    if (!text) return;
    if (state.destination === "marker") {
      marker = (marker + text).slice(0, 40);
      return;
    }
    if (state.destination === "font" && currentFont >= 0) {
      const separator = text.indexOf(";");
      fontName = (fontName + (separator < 0 ? text : text.slice(0, separator))).slice(0, 60);
      if (separator >= 0) {
        fonts.set(currentFont, wordFont(fontName));
        currentFont = -1;
        fontName = "";
      }
      return;
    }
    if (state.skip) return;
    if (fallback && skipCharacters > 0) {
      const count = Math.min(text.length, skipCharacters);
      skipCharacters -= count;
      text = text.slice(count);
    }
    if (!text) return;
    chars += text.length;
    if (chars > wordLimit) throw Error("This document exceeds WordPad’s text limit.");
    const previous = paragraph.runs.at(-1);
    if (previous && wordSameStyle(previous, state.style)) previous.text += text;
    else paragraph.runs.push({...state.style, text});
  }

  function newParagraph() {
    if (paragraphs.length >= 7000) throw Error("This document has too many paragraphs.");
    paragraphs.push(paragraph);
    paragraph = wordParagraph(paragraph.kind, paragraph.align);
    skipCharacters = 0;
  }

  function control(word, value) {
    if (word === "fonttbl") {
      if (!state.skip) {
        fontTableDepth = stack.length;
        state.skip = true;
        state.destination = "font";
      }
      return;
    }
    if (word === "listtext" || word === "pntext") {
      if (!state.skip) {
        state.skip = true;
        state.destination = "marker";
        marker = "";
      }
      return;
    }
    if (state.destination === "font" && word === "f") {
      currentFont = value ?? -1;
      fontName = "";
      return;
    }
    if (state.starred || ignored.has(word)) {
      state.skip = true;
      state.destination = "";
      state.starred = false;
      return;
    }
    if (state.skip) {
      if (state.destination === "marker" && symbols[word]) add(symbols[word]);
      return;
    }
    switch (word) {
      case "ansicpg": state.codepage = value || 1252; break;
      case "mac": state.codepage = 10000; break;
      case "uc": state.uc = Math.min(Math.max(value ?? 1, 0), 8); break;
      case "u":
        if (value !== undefined) {
          add(String.fromCharCode(value & 0xffff), false);
          skipCharacters = state.uc;
        }
        break;
      case "plain": state.style = {...wordNormalStyle}; break;
      case "pard": paragraph.kind = "p"; paragraph.align = "left"; break;
      case "b": state.style.bold = value !== 0; break;
      case "i": state.style.italic = value !== 0; break;
      case "ul": state.style.underline = value !== 0; break;
      case "ulnone": state.style.underline = false; break;
      case "strike": state.style.strike = value !== 0; break;
      case "f": state.style.font = fonts.get(value) ?? 0; break;
      case "fs": state.style.size = wordSize((value ?? 22) / 2); break;
      case "qc": paragraph.align = "center"; break;
      case "qr": paragraph.align = "right"; break;
      case "qj": paragraph.align = "justify"; break;
      case "ql": paragraph.align = "left"; break;
      case "outlinelevel":
        if (value >= 0 && value <= 2) paragraph.kind = "h" + (value + 1);
        break;
      case "ls":
        if (value && paragraph.kind === "p") paragraph.kind = value === 2 ? "ol" : "ul";
        break;
      case "par": newParagraph(); break;
      case "line": add("\n"); break;
      case "tab": add("\t"); break;
      default: if (symbols[word]) add(symbols[word]);
    }
  }

  for (let index = 0; index < data.length;) {
    const character = data[index++];
    if (character === "{") {
      if (stack.length >= 100) throw Error("The RTF contains too many nested groups.");
      stack.push(state);
      state = {...state, style: {...state.style}, starred: false};
    } else if (character === "}") {
      if (!stack.length) throw Error("The RTF has an invalid closing group.");
      const previous = stack.pop();
      if (state.destination === "marker" && previous.destination !== "marker") {
        if (marker.trim()) paragraph.kind = /^\s*\(?\d+[.)]/.test(marker) ? "ol" : "ul";
        marker = "";
      }
      if (fontTableDepth === stack.length + 1) { fontTableDepth = 0; currentFont = -1; }
      state = previous;
    } else if (character !== "\\") {
      if (character === "\r" || character === "\n") continue;
      if (character.charCodeAt(0) >= 128 && character.charCodeAt(0) < 256) {
        const bytes = [character.charCodeAt(0)];
        while (index < data.length && data.charCodeAt(index) >= 128 && data.charCodeAt(index) < 256) {
          bytes.push(data.charCodeAt(index++));
        }
        add(decoder(state.codepage).decode(Uint8Array.from(bytes)));
      } else add(character);
    } else if (/[A-Za-z]/.test(data[index] || "")) {
      const first = index;
      while (/[A-Za-z]/.test(data[index] || "")) index++;
      const word = data.slice(first, index).toLowerCase();
      const number = index;
      if (data[index] === "-") index++;
      while (/[0-9]/.test(data[index] || "")) index++;
      const value = index > number ? Number(data.slice(number, index)) : undefined;
      if (data[index] === " ") index++;
      if (word === "bin") {
        if (!Number.isInteger(value) || value < 0 || value > data.length - index) throw Error("The RTF binary data is incomplete.");
        index += value;
      } else control(word, value);
    } else {
      const symbol = data[index++];
      if (symbol === "'") {
        const bytes = [];
        do {
          const hex = data.slice(index, index + 2);
          if (!/^[a-f0-9]{2}$/i.test(hex)) throw Error("The RTF contains invalid character data.");
          bytes.push(Number.parseInt(hex, 16));
          index += 2;
          if (data.slice(index, index + 2) !== "\\'") break;
          index += 2;
        } while (index < data.length);
        if (skipCharacters) {
          const consumed = Math.min(bytes.length, skipCharacters);
          bytes.splice(0, consumed);
          skipCharacters -= consumed;
        }
        if (bytes.length) add(decoder(state.codepage).decode(Uint8Array.from(bytes)), false);
      } else if (symbol === "*") state.starred = true;
      else if (symbol === "~") add("\u00a0");
      else if (symbol === "_") add("‑");
      else if (symbol === "{" || symbol === "}" || symbol === "\\") add(symbol);
    }
  }
  if (stack.length) throw Error("The RTF document is incomplete.");
  if (paragraph.runs.length || !paragraphs.length) paragraphs.push(paragraph);
  return paragraphs;
}

function wordEscape(text) {
  return text.replace(/[\\{}\t\n\u0080-\uffff]/g, character => {
    if (character === "\t") return "\\tab ";
    if (character === "\n") return "\\line ";
    if ("\\{}".includes(character)) return "\\" + character;
    const code = character.charCodeAt(0);
    return "\\u" + (code > 32767 ? code - 65536 : code) + "?";
  });
}

function writeWordRtf(paragraphs) {
  const hasLists = paragraphs.some(row => row.kind === "ul" || row.kind === "ol");
  const lists = hasLists ? "{\\*\\listtable" +
    "{\\list\\listtemplateid1\\listsimple{\\listlevel\\levelnfc23\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'01\\u8226 ?;}{\\levelnumbers;}\\fi-360\\li720}\\listid1}" +
    "{\\list\\listtemplateid2\\listsimple{\\listlevel\\levelnfc0\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'02\\'00.;}{\\levelnumbers\\'01;}\\fi-360\\li720}\\listid2}}" +
    "{\\*\\listoverridetable{\\listoverride\\listid1\\listoverridecount0\\ls1}{\\listoverride\\listid2\\listoverridecount0\\ls2}}" : "";
  let ordinal = 0;
  const content = paragraphs.map(row => {
    const alignment = {left: "ql", center: "qc", right: "qr", justify: "qj"}[row.align] || "ql";
    const heading = /^h[1-3]$/.test(row.kind) ? "\\outlinelevel" + (Number(row.kind[1]) - 1) : "";
    let prefix = "";
    if (row.kind === "ol") prefix = "\\ls2\\ilvl0{\\listtext " + (++ordinal) + ".\\tab}";
    else {
      ordinal = 0;
      if (row.kind === "ul") prefix = "\\ls1\\ilvl0{\\listtext\\u8226 ?\\tab}";
    }
    const runs = row.runs.map(run => "{\\f" + run.font + "\\fs" + wordSize(run.size) * 2 +
      (run.bold ? "\\b" : "") + (run.italic ? "\\i" : "") + (run.underline ? "\\ul" : "") +
      (run.strike ? "\\strike" : "") + " " + wordEscape(run.text) + "}").join("");
    return "\\pard\\" + alignment + heading + (prefix || " ") + runs + "\\par\n";
  }).join("");
  return "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl" +
    "{\\f0\\fswiss Arial;}{\\f1\\froman Times New Roman;}{\\f2\\fmodern Courier New;}}" + lists + "\n" + content + "}";
}

function wordPlainText(text) {
  if (text.length > wordLimit) throw Error("This document exceeds WordPad’s text limit.");
  return text.replace(/\r\n?/g, "\n").split("\n").map(line => ({
    ...wordParagraph(), runs: line ? [{...wordNormalStyle, text: line}] : []
  }));
}
