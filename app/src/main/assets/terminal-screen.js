"use strict";

const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 24;
const TERM_COLORS = ["#000000", "#a80000", "#00a800", "#a85400", "#3259d9", "#a800a8", "#00a8a8", "#a8a8a8",
  "#545454", "#ff5454", "#54ff54", "#ffff54", "#749bff", "#ff54ff", "#54ffff", "#ffffff"];
const TERM_STYLE = Object.freeze({ink: null, paper: null, bold: false, underline: false, inverse: false, brightPaper: false});
const TERM_GRAPHICS = {j:"┘", k:"┐", l:"┌", m:"└", n:"┼", q:"─", t:"├", u:"┤", v:"┴", w:"┬", x:"│",
  a:"▒", "\x60":"◆", f:"°", g:"±", o:"⎺", p:"⎻", r:"⎼", s:"⎽", y:"≤", z:"≥", "{":"π", "|":"≠", "}":"£", "~":"·"};

class TerminalScreen {
  constructor(reply = () => {}, options = {}) {
    this.reply = reply;
    this.columns = options.columns || TERMINAL_COLS;
    this.rows = TERMINAL_ROWS;
    this.historyLimit = options.historyLimit || 320;
    this.iceColors = options.iceColors === true;
    this.reset();
  }

  reset() {
    this.history = [];
    this.trimmedHistory = false;
    this.historyVersion = (this.historyVersion || 0) + 1;
    this.alt = null;
    this.grid = Array.from({length: this.rows}, () => this.blank());
    this.mode = "";
    this.control = "";
    this.graphics = false;
    this.wrap = true;
    this.cursor = true;
    this.applicationCursor = false;
    this.style = TERM_STYLE;
    this.x = this.y = 0;
    this.top = 0;
    this.bottom = this.rows - 1;
    this.pendingWrap = false;
    this.saved = this.position();
  }

  clearDisplay() {
    this.history = [];
    this.trimmedHistory = false;
    this.historyVersion++;
    this.grid = Array.from({length: this.rows}, () => this.blank());
    this.pendingWrap = false;
  }

  blank() { return Array(this.columns).fill(null); }
  position() { return {x: this.x, y: this.y, style: this.style, graphics: this.graphics}; }

  move(x, y) {
    this.x = Math.max(0, Math.min(this.columns - 1, x));
    this.y = Math.max(0, Math.min(this.rows - 1, y));
    this.pendingWrap = false;
  }

  restore() {
    this.move(this.saved.x, this.saved.y);
    this.style = this.saved.style;
    this.graphics = this.saved.graphics;
  }

  scroll(count, up) {
    const total = Math.min(count, this.bottom - this.top + 1);
    const offset = up ? this.top : this.bottom - total + 1;
    const removed = this.grid.splice(offset, total);
    if (up && !this.alt && this.top === 0 && this.bottom === this.rows - 1) {
      this.history.push(...removed);
      if (this.history.length > this.historyLimit) {
        this.history.splice(0, this.history.length - this.historyLimit);
        this.trimmedHistory = true;
      }
      this.historyVersion++;
    }
    this.grid.splice(up ? this.bottom - total + 1 : this.top, 0,
      ...Array.from({length: total}, () => this.blank()));
  }

  line(reverse = false) {
    this.pendingWrap = false;
    if (!reverse && this.y === this.bottom) this.scroll(1, true);
    else if (reverse && this.y === this.top) this.scroll(1, false);
    else this.move(this.x, this.y + (reverse ? -1 : 1));
  }

  glyph(text) {
    if (this.graphics) text = TERM_GRAPHICS[text] || text;
    if (/\p{Mark}/u.test(text)) {
      const row = this.grid[this.y];
      const x = this.pendingWrap ? this.x : Math.max(0, this.x - 1);
      const base = row[x]?.continuation ? row[x - 1] : row[x];
      if (base && base.text.length < 48) base.text += text;
      return;
    }
    const width = terminalGlyphWidth(text);
    if ((this.pendingWrap || this.x + width > this.columns) && this.wrap) {
      this.line();
      this.x = 0;
    }
    const row = this.grid[this.y];
    this.removeGlyph(row, this.x);
    if (width === 2 && this.x + 1 < this.columns) this.removeGlyph(row, this.x + 1);
    row[this.x] = {text, style: this.style, width: Math.min(width, this.columns - this.x)};
    if (width === 2 && this.x + 1 < this.columns) row[this.x + 1] = {continuation: true};
    this.pendingWrap = this.x + width >= this.columns;
    this.x = Math.min(this.columns - 1, this.x + width);
  }

  removeGlyph(row, at) {
    if (row[at]?.continuation && at > 0) row[at - 1] = null;
    if (row[at]?.width === 2) row[at + 1] = null;
    row[at] = null;
  }

  erase(row, start = 0, end = this.columns - 1) {
    for (let x = start; x <= end; x++) {
      this.removeGlyph(row, x);
      if (this.style.paper || this.style.inverse || this.style.brightPaper) row[x] = {text:" ", style:this.style, width:1};
    }
    this.pendingWrap = false;
  }

  deleteLines(count, insert) {
    if (this.y < this.top || this.y > this.bottom) return;
    const size = Math.min(count, this.bottom - this.y + 1);
    this.grid.splice(insert ? this.bottom - size + 1 : this.y, size);
    this.grid.splice(insert ? this.y : this.bottom - size + 1, 0, ...Array.from({length:size}, () => this.blank()));
  }

  alternate(on) {
    if (on && !this.alt) {
      this.alt = {grid: this.grid, saved: this.saved, position: this.position(), top: this.top, bottom: this.bottom};
      this.grid = Array.from({length: this.rows}, () => this.blank());
      this.style = TERM_STYLE;
      this.top = 0;
      this.bottom = this.rows - 1;
      this.move(0, 0);
      this.saved = this.position();
    } else if (!on && this.alt) {
      const {grid, saved, position, top, bottom} = this.alt;
      Object.assign(this, {grid, top, bottom, alt: null, saved: position});
      this.restore();
      this.saved = saved;
    }
    this.historyVersion++;
  }

  put(text) {
    for (const value of text) {
      if (value === "\x1b" && !["osc", "oscEnd"].includes(this.mode)) {
        this.mode = "escape";
        continue;
      }
      switch (this.mode) {
        case "osc":
          if (value === "\x07") this.mode = "";
          else if (value === "\x1b") this.mode = "oscEnd";
          continue;
        case "oscEnd":
          this.mode = value === "\\" ? "" : "osc";
          continue;
        case "charset":
          this.graphics = value === "0";
          this.mode = "";
          continue;
        case "escape":
          this.escape(value);
          continue;
        case "csi": {
          const code = value.charCodeAt(0);
          if (code >= 0x40 && code <= 0x7e) {
            if (this.control.length <= 96) this.csi(value, this.control);
            this.mode = "";
          } else if (code === 0x18 || code === 0x1a) this.mode = "";
          else if (this.control.length <= 96) this.control += value;
          continue;
        }
      }
      if (value === "\r") this.move(0, this.y);
      else if (value === "\n" || value === "\x0b" || value === "\x0c") this.line();
      else if (value === "\b") this.move(this.x - 1, this.y);
      else if (value === "\t") this.move((Math.floor(this.x / 8) + 1) * 8, this.y);
      else if (value >= " " && value !== "\x7f" && !(value >= "\x80" && value <= "\x9f")) this.glyph(value);
    }
  }

  escape(code) {
    this.mode = "";
    if (code === "[") {
      this.mode = "csi";
      this.control = "";
    } else if ("]PX^_".includes(code)) this.mode = "osc";
    else if (code === "(" || code === ")") this.mode = "charset";
    else if (code === "7") this.saved = this.position();
    else if (code === "8") this.restore();
    else if (code === "D") this.line();
    else if (code === "E") { this.move(0, this.y); this.line(); }
    else if (code === "M") this.line(true);
    else if (code === "c") this.reset();
  }

  csi(code, control) {
    const privateMode = control.startsWith("?");
    const argumentsText = privateMode ? control.slice(1) : control;
    if (!/^[\d;]*$/.test(argumentsText)) return;
    const args = argumentsText.split(";").map(value => Number(value) || 0);
    const n = args[0] || 1;
    const row = this.grid[this.y];
    if (privateMode) {
      if (code !== "h" && code !== "l") return;
      for (const setting of args) {
        if (setting === 1) this.applicationCursor = code === "h";
        else if (setting === 7) this.wrap = code === "h";
        else if (setting === 25) this.cursor = code === "h";
        else if (setting === 47 || setting === 1047 || setting === 1049) this.alternate(code === "h");
      }
      return;
    }
    switch (code) {
      case "A": this.move(this.x, this.y - n); break;
      case "B": case "e": this.move(this.x, this.y + n); break;
      case "C": case "a": this.move(this.x + n, this.y); break;
      case "D": this.move(this.x - n, this.y); break;
      case "E": this.move(0, this.y + n); break;
      case "F": this.move(0, this.y - n); break;
      case "G": this.move(n - 1, this.y); break;
      case "d": this.move(this.x, n - 1); break;
      case "H": case "f": this.move((args[1] || 1) - 1, n - 1); break;
      case "J":
        if (args[0] === 3) {
          this.history = [];
          this.trimmedHistory = false;
          this.historyVersion++;
        } else if (args[0] === 2) this.grid.forEach(line => this.erase(line));
        else if (args[0] === 1) {
          this.grid.slice(0, this.y).forEach(line => this.erase(line));
          this.erase(row, 0, this.x);
        } else {
          this.erase(row, this.x);
          this.grid.slice(this.y + 1).forEach(line => this.erase(line));
        }
        break;
      case "K":
        if (args[0] === 2) this.erase(row);
        else if (args[0] === 1) this.erase(row, 0, this.x);
        else this.erase(row, this.x);
        break;
      case "@": case "P": {
        const count = Math.min(this.columns - this.x, n);
        if (row[this.x]?.continuation) this.removeGlyph(row, this.x);
        if (code === "@") row.splice(this.x, 0, ...Array(count).fill(null));
        else row.splice(this.x, count);
        row.length = Math.min(row.length, this.columns);
        while (row.length < this.columns) row.push(null);
        for (let index = this.x; index < this.columns; index++) {
          if (row[index]?.continuation && row[index - 1]?.width !== 2) row[index] = null;
          if (row[index]?.width === 2 && !row[index + 1]?.continuation) row[index] = null;
        }
        this.pendingWrap = false;
        break;
      }
      case "X": this.erase(row, this.x, Math.min(this.x + n - 1, this.columns - 1)); break;
      case "L": case "M": this.deleteLines(n, code === "L"); break;
      case "S": case "T": this.scroll(n, code === "S"); break;
      case "r": {
        const bottom = Math.min(this.rows, args[1] || this.rows);
        if (n < bottom) {
          this.top = n - 1;
          this.bottom = bottom - 1;
          this.move(0, 0);
        }
        break;
      }
      case "s": this.saved = this.position(); break;
      case "u": this.restore(); break;
      case "m": this.style = terminalFormat(this.style, args, this.iceColors); break;
      case "n":
        if (n === 5) this.reply("\x1b[0n");
        else if (n === 6) this.reply("\x1b[" + (this.y + 1) + ";" + (this.x + 1) + "R");
        break;
      case "c": this.reply("\x1b[?1;0c"); break;
    }
  }

  text(includeHistory = true) {
    const lines = includeHistory ? [...this.history, ...this.grid] : this.grid;
    return lines.map(line => line.map(cell => cell?.continuation ? "" : cell?.text || " ").join("").trimEnd())
      .join("\r\n").trimEnd();
  }
}

function terminalGlyphWidth(value) {
  const code = value.codePointAt(0);
  return code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60) || (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)) ? 2 : 1;
}

function terminalPalette(index) {
  if (index < 16) return TERM_COLORS[index];
  if (index > 255) return null;
  if (index >= 232) {
    const value = 8 + (index - 232) * 10;
    return "rgb(" + [value, value, value].join(",") + ")";
  }
  const color = index - 16;
  const level = x => x ? x * 40 + 55 : 0;
  return "rgb(" + [level(Math.floor(color / 36)), level(Math.floor(color / 6) % 6), level(color % 6)].join(",") + ")";
}

function terminalFormat(existing, args, iceColors) {
  let next = {...existing};
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === 0) next = {...TERM_STYLE};
    else if (value === 1 || value === 22) next.bold = value === 1;
    else if (value === 4 || value === 24) next.underline = value === 4;
    else if (iceColors && (value === 5 || value === 25)) next.brightPaper = value === 5;
    else if (value === 7 || value === 27) next.inverse = value === 7;
    else if (value >= 30 && value <= 37) next.ink = TERM_COLORS[value - 30];
    else if (value >= 40 && value <= 47) next.paper = TERM_COLORS[value - 40];
    else if (value >= 90 && value <= 97) next.ink = TERM_COLORS[value - 82];
    else if (value >= 100 && value <= 107) next.paper = TERM_COLORS[value - 92];
    else if (value === 39) next.ink = null;
    else if (value === 49) next.paper = null;
    else if (value === 38 || value === 48) {
      const property = value === 38 ? "ink" : "paper";
      if (args[index + 1] === 5 && args.length > index + 2) {
        next[property] = terminalPalette(args[index + 2]);
        index += 2;
      } else if (args[index + 1] === 2 && args.length > index + 4) {
        next[property] = "rgb(" + args.slice(index + 2, index + 5).map(value => Math.min(255, value)).join(",") + ")";
        index += 4;
      }
    }
  }
  return next;
}
