"use strict";

function shuffled(values) {
  const result = [...values];
  for (let end = result.length - 1; end > 0; end--) {
    const other = Math.floor(Math.random() * (end + 1));
    [result[end], result[other]] = [result[other], result[end]];
  }
  return result;
}

function renderMinesweeper(win) {
  const side = 9;
  const mines = 10;
  const count = side * side;
  const adjacent = Array.from({length: count}, (_, index) => {
    const x = index % side;
    const y = Math.floor(index / side);
    const neighbors = [];
    for (let row = Math.max(0, y - 1); row <= Math.min(side - 1, y + 1); row++) {
      for (let col = Math.max(0, x - 1); col <= Math.min(side - 1, x + 1); col++) {
        if (row !== y || col !== x) neighbors.push(row * side + col);
      }
    }
    return neighbors;
  });
  const counters = element("div", "mine-counters sunken");
  const remaining = element("output", "mine-display", "010");
  remaining.setAttribute("aria-label", "Mines remaining");
  const elapsed = element("output", "mine-display", "000");
  elapsed.setAttribute("aria-label", "Seconds");
  const reset = toolbarButton("☺", newGame);
  reset.classList.add("mine-face");
  reset.setAttribute("aria-label", "New Minesweeper game");
  counters.append(remaining, reset, elapsed);

  const toolbar = element("div", "app-toolbar mine-toolbar");
  const flag = toolbarButton("Flag Mode", () => {
    flagMode = !flagMode;
    flag.setAttribute("aria-pressed", String(flagMode));
  });
  flag.setAttribute("aria-pressed", "false");
  toolbar.append(flag);
  const field = element("div", "mine-field sunken");
  field.setAttribute("aria-label", "Minesweeper board");
  const status = appStatus("");
  const surface = element("div", "game-scroll mine-game");

  let cells;
  let phase;
  let flagMode;
  let started;
  let exploded;

  const tiles = adjacent.map((_, index) => {
    const node = button(null, () => flagMode ? mark(index) : reveal(index), "bevel mine-tile");
    node.addEventListener("contextmenu", event => {
      event.preventDefault();
      mark(index);
    });
    return node;
  });

  function newGame() {
    cells = Array.from({length: count}, () => ({mine: false, around: 0, shown: false, flagged: false}));
    phase = "ready";
    flagMode = false;
    started = 0;
    exploded = -1;
    flag.setAttribute("aria-pressed", "false");
    status.textContent = "Reveal a square to start.";
    repaint();
  }

  function seed(index) {
    const safe = new Set([index, ...adjacent[index]]);
    const candidates = shuffled([...cells.keys()].filter(key => !safe.has(key)));
    candidates.slice(0, mines).forEach(key => { cells[key].mine = true; });
    cells.forEach((cell, key) => {
      cell.around = adjacent[key].filter(neighbor => cells[neighbor].mine).length;
    });
    phase = "playing";
    started = Date.now();
    status.textContent = "Reveal the board. Flag suspected mines.";
  }

  function mark(index) {
    const cell = cells[index];
    if (phase === "lost" || phase === "won" || cell.shown) return;
    cell.flagged = !cell.flagged;
    repaint();
  }

  function reveal(index) {
    if (phase === "lost" || phase === "won" || cells[index].flagged || cells[index].shown) return;
    if (phase === "ready") seed(index);
    if (cells[index].mine) {
      exploded = index;
      phase = "lost";
      status.textContent = "You hit a mine. Tap the face to play again.";
    } else {
      const pending = [index];
      while (pending.length) {
        const key = pending.pop();
        const cell = cells[key];
        if (cell.shown || cell.flagged || cell.mine) continue;
        cell.shown = true;
        if (!cell.around) pending.push(...adjacent[key]);
      }
      if (cells.every(cell => cell.mine || cell.shown)) {
        phase = "won";
        status.textContent = "You cleared the board!";
      }
    }
    if (phase !== "playing") updateTime();
    repaint();
  }

  function repaint() {
    const left = mines - cells.filter(cell => cell.flagged).length;
    remaining.textContent = phase === "won" ? "000" : (left < 0
      ? "-" + String(-left).padStart(2, "0") : String(left).padStart(3, "0"));
    reset.textContent = phase === "lost" ? "☹" : phase === "won" ? "★" : "☺";
    if (!started) elapsed.textContent = "000";
    tiles.forEach((node, index) => {
      const cell = cells[index];
      const exposedMine = (phase === "lost" || phase === "won") && cell.mine;
      const wrongFlag = phase === "lost" && cell.flagged && !cell.mine;
      const open = cell.shown || exposedMine || wrongFlag;
      let value = "";
      if (wrongFlag) value = "×";
      else if (cell.flagged || (phase === "won" && exposedMine)) value = "⚑";
      else if (exposedMine) value = "✹";
      else if (cell.shown && cell.around) value = String(cell.around);
      node.className = "mine-tile " + (open ? "mine-open" : "bevel");
      node.classList.toggle("mine-exploded", index === exploded);
      node.classList.toggle("mine-flag", value === "⚑" || wrongFlag);
      node.dataset.number = cell.shown ? String(cell.around) : "";
      node.textContent = value;
      const label = open ? (value || "Empty") : (cell.flagged ? "Flagged" : "Hidden");
      node.setAttribute("aria-label", label + ", row " + (Math.floor(index / side) + 1) + ", column " + (index % side + 1));
    });
  }

  function updateTime() {
    if (started) elapsed.textContent = String(Math.min(999, Math.floor((Date.now() - started) / 1000))).padStart(3, "0");
  }

  newGame();
  field.append(...tiles);
  surface.append(counters, toolbar, field);
  win.body.replaceChildren(surface, status);
  const timer = setInterval(() => { if (phase === "playing") updateTime(); }, 250);
  win.cleanup = () => clearInterval(timer);
}

function renderSolitaire(win) {
  const suits = ["♣", "♦", "♠", "♥"];
  const names = ["clubs", "diamonds", "spades", "hearts"];
  const ranks = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const toolbar = element("div", "app-toolbar");
  toolbar.append(toolbarButton("New Game", deal));
  const status = appStatus("");
  const playingField = element("div", "game-scroll solitaire-field");
  const top = element("div", "solitaire-row solitaire-top");
  const table = element("div", "solitaire-row solitaire-table");
  playingField.append(top, table);
  win.body.replaceChildren(toolbar, playingField, status);

  let stock;
  let waste;
  let foundations;
  let columns;
  let selection;

  function deal() {
    stock = shuffled(suits.flatMap((_, suit) => ranks.slice(1).map((label, index) => ({
      suit, rank: index + 1, faceUp: false
    }))));
    waste = [];
    foundations = suits.map(() => []);
    columns = Array.from({length: 7}, (_, index) => {
      const stack = stock.splice(0, index + 1);
      stack[stack.length - 1].faceUp = true;
      return stack;
    });
    selection = null;
    status.textContent = "Tap a face-up card, then tap its destination.";
    paint();
  }

  function draw() {
    selection = null;
    if (stock.length) {
      const card = stock.pop();
      card.faceUp = true;
      waste.push(card);
    } else if (waste.length) {
      stock = waste.reverse();
      stock.forEach(card => { card.faceUp = false; });
      waste = [];
    }
    status.textContent = "Build the four foundations from Ace to King.";
    paint();
  }

  function sourceAt(point) {
    if (point.kind === "column") return columns[point.index];
    if (point.kind === "foundation") return foundations[point.index];
    return waste;
  }

  function red(card) {
    return card.suit === 1 || card.suit === 3;
  }

  function selectOrMove(kind, index, depth) {
    const destination = {kind, index, depth};
    const stack = sourceAt(destination);
    const card = stack[depth];
    if (selection) {
      const source = sourceAt(selection);
      if (source === stack && selection.depth === depth) {
        selection = null;
        paint();
        return;
      }
      const first = source[selection.depth];
      const last = stack[stack.length - 1];
      const one = source.length - selection.depth === 1;
      const validFoundation = kind === "foundation" && one && first.suit === index
        && first.rank === (last ? last.rank + 1 : 1);
      const validColumn = kind === "column" && (last
        ? last.faceUp && first.rank + 1 === last.rank && red(first) !== red(last)
        : first.rank === 13);
      if (source !== stack && (validFoundation || validColumn)) {
        stack.push(...source.splice(selection.depth));
        if (selection.kind === "column" && source.length) source[source.length - 1].faceUp = true;
        selection = null;
        status.textContent = foundations.every(pile => pile.length === 13)
          ? "You won!" : "Build the four foundations from Ace to King.";
        paint();
        return;
      }
    }
    selection = card?.faceUp ? destination : null;
    status.textContent = selection ? "Tap the destination for " + cardName(card) + "." : "Tap a face-up card to move it.";
    paint();
  }

  function cardName(card) {
    return ranks[card.rank] + " of " + names[card.suit];
  }

  function cardButton(card, label, action, point = null) {
    const visible = card?.faceUp;
    const isSelected = point && selection && point.kind === selection.kind && point.index === selection.index
      && (point.kind === "column" ? point.depth >= selection.depth : point.depth === selection.depth);
    const node = button(null, action, "solitaire-card");
    node.classList.add(card ? (visible ? "card-face" : "card-back") : "card-slot");
    if (visible && red(card)) node.classList.add("card-red");
    if (isSelected) node.classList.add("card-selected");
    node.setAttribute("aria-label", visible ? cardName(card) : label);
    if (visible) {
      node.append(element("span", "card-corner", ranks[card.rank] + suits[card.suit]), element("span", "card-suit", suits[card.suit]));
    } else if (!card) node.append(element("span", "card-suit", label === "Redeal" ? "↻" : label.startsWith("Foundation") ? suits[point.index] : ""));
    return node;
  }

  function paint() {
    const drawPile = cardButton(stock[stock.length - 1], stock.length ? "Draw a card" : "Redeal", draw);
    const wastePoint = {kind: "waste", index: 0, depth: waste.length - 1};
    const discard = cardButton(waste[wastePoint.depth], "Empty waste pile",
      () => selectOrMove("waste", 0, wastePoint.depth), wastePoint);
    const spacer = element("span", "");
    const goals = foundations.map((stack, index) => {
      const depth = stack.length - 1;
      return cardButton(stack[depth], "Foundation for " + names[index],
        () => selectOrMove("foundation", index, depth), {kind: "foundation", index, depth});
    });
    top.replaceChildren(drawPile, discard, spacer, ...goals);
    table.replaceChildren(...columns.map((stack, index) => {
      const column = element("div", "solitaire-column");
      if (stack.length) stack.forEach((card, depth) => {
        const node = cardButton(card, "Face-down card", () => selectOrMove("column", index, depth), {kind: "column", index, depth});
        column.append(node);
      });
      else column.append(cardButton(null, "Empty column " + (index + 1), () => selectOrMove("column", index, -1)));
      return column;
    }));
  }

  deal();
}
