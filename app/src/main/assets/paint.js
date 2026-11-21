"use strict";

const paintPalette = [
  ["Black", "#000000"], ["Gray", "#808080"], ["Maroon", "#800000"], ["Olive", "#808000"],
  ["Green", "#008000"], ["Teal", "#008080"], ["Navy", "#000080"], ["Purple", "#800080"],
  ["White", "#ffffff"], ["Silver", "#c0c0c0"], ["Red", "#ff0000"], ["Yellow", "#ffff00"],
  ["Lime", "#00ff00"], ["Aqua", "#00ffff"], ["Blue", "#0000ff"], ["Fuchsia", "#ff00ff"]
];
let paintSaveSequence = 0;

function renderPaint(win) {
  const menuBar = element("div", "app-toolbar");
  const drawingBar = element("div", "app-toolbar paint-tools");
  const surface = element("div", "explorer paint-surface");
  const canvas = element("canvas", "paint-canvas");
  canvas.setAttribute("aria-label", "Drawing canvas");
  const palette = element("div", "paint-palette");
  const status = appStatus("");
  const context = canvas.getContext("2d", {willReadFrequently: true});
  const history = [];
  let tool = "pencil";
  let ink = paintPalette[0][1];
  let drawing;
  let dirty = false;
  let revision = 0;
  let pendingSave = "";
  let fileName = "Untitled";
  let incomingImage = 0;

  const update = (message = "") => {
    status.textContent = message || (canvas.width + " × " + canvas.height + " · " + fileName +
      (dirty ? " · Unsaved" : ""));
    undo.disabled = !history.length || !!drawing;
    save.disabled = wallpaper.disabled = !!drawing || !!pendingSave;
  };

  function confirmDiscard(action) {
    if (!dirty) { action(); return; }
    dialog({kind: "paint-discard", title: "Paint", icon: "paint",
      message: "Discard the unsaved changes to this picture?", accept: "Discard", cancel: "Keep Editing",
      onAccept: action});
  }

  function reset(width = 640, height = 400, image = null, name = "Untitled") {
    revision++;
    drawing = null;
    history.length = 0;
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    if (image) context.drawImage(image, 0, 0);
    fileName = name;
    dirty = false;
    surface.scrollTo(0, 0);
    update();
  }

  const newPicture = toolbarButton("New", () => confirmDiscard(() => { incomingImage++; reset(); }));
  const open = toolbarButton("Open…", () => openFileLocation("pictures"));
  const importFile = toolbarButton("Import…", () => native?.desktopFile?.("pick-image", "", ""));
  const save = toolbarButton("Save PNG", () => {
    if (!native?.desktopFile) {
      const link = element("a");
      link.href = canvas.toDataURL("image/png");
      link.download = pngName();
      link.click();
      return;
    }
    const savedRevision = revision;
    pendingSave = "paint:" + (++paintSaveSequence);
    win.finishPaintSave = (success, name) => {
      if (savedRevision === revision && success) {
        dirty = false;
        fileName = name || pngName();
      }
      pendingSave = "";
      update(success ? "Picture saved." : "");
    };
    native.desktopFile("save-png", pendingSave, JSON.stringify({name: pngName(), image: canvas.toDataURL("image/png")}));
    update("Saving to My Pictures…");
  });
  const wallpaper = toolbarButton("Set as Wallpaper", () => {
    if (!native?.desktopFile) return;
    native.desktopFile("paint-wallpaper", "", canvas.toDataURL("image/png"));
  });
  const undo = toolbarButton("Undo", () => {
    if (!history.length || drawing) return;
    const previous = history.pop();
    context.putImageData(previous.pixels, 0, 0);
    revision++;
    dirty = true;
    update();
  });
  const pngName = () => fileName.replace(/\.[a-z0-9]{1,6}$/i, "") + ".png";
  menuBar.append(newPicture, open, save, importFile, wallpaper);

  const tools = [["pencil", "Pencil"], ["fill", "Fill"], ["line", "Line"],
    ["rectangle", "Rectangle"], ["ellipse", "Ellipse"], ["erase", "Eraser"]];
  for (const [name, label] of tools) {
    const control = toolbarButton(label, () => {
      tool = name;
      for (const peer of drawingBar.querySelectorAll("[data-tool]")) {
        peer.setAttribute("aria-pressed", String(peer.dataset.tool === name));
      }
    });
    control.dataset.tool = name;
    control.setAttribute("aria-pressed", String(name === tool));
    drawingBar.append(control);
  }
  drawingBar.append(undo);
  for (const [name, color] of paintPalette) {
    const swatch = button("", () => {
      ink = color;
      for (const peer of palette.children) peer.setAttribute("aria-pressed", String(peer === swatch));
    }, "bevel paint-swatch");
    swatch.style.setProperty("--ink", color);
    swatch.setAttribute("aria-label", name);
    swatch.setAttribute("aria-pressed", String(color === ink));
    swatch.title = name;
    palette.append(swatch);
  }

  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width), 0, canvas.width - 1),
      y: clamp(Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height), 0, canvas.height - 1)
    };
  }

  function stroke(from, to, selectedTool, color) {
    context.strokeStyle = selectedTool === "erase" ? "#fff" : color;
    context.lineWidth = selectedTool === "erase" ? 12 : 2;
    context.lineCap = "round";
    context.beginPath();
    if (selectedTool === "ellipse") {
      context.ellipse((to.x + from.x) / 2, (to.y + from.y) / 2,
        Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
    } else if (selectedTool === "rectangle") {
      context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else {
      context.moveTo(from.x, from.y);
      context.lineTo(to.x + (to.x === from.x && to.y === from.y ? 0.01 : 0), to.y);
    }
    context.stroke();
  }

  function fill(point, color, pixels) {
    const {data, width, height} = pixels;
    const start = (point.y * width + point.x) * 4;
    const original = data.slice(start, start + 4);
    const rgb = Number.parseInt(color.slice(1), 16);
    const replacement = [rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255];
    if (original.every((value, index) => value === replacement[index])) return false;
    const queue = new Int32Array(width * height);
    let end = 0;
    function enqueue(pixel) {
      const offset = pixel * 4;
      if (data[offset] !== original[0] || data[offset + 1] !== original[1] ||
          data[offset + 2] !== original[2] || data[offset + 3] !== original[3]) return;
      data.set(replacement, offset);
      queue[end++] = pixel;
    }
    enqueue(start / 4);
    for (let index = 0; index < end; index++) {
      const pixel = queue[index];
      if (pixel % width > 0) enqueue(pixel - 1);
      if (pixel % width < width - 1) enqueue(pixel + 1);
      if (pixel >= width) enqueue(pixel - width);
      if (pixel + width < queue.length) enqueue(pixel + width);
    }
    context.putImageData(pixels, 0, 0);
    return true;
  }

  function commit(pixels) {
    history.push({pixels});
    while (history.length > Math.min(12, Math.max(2, Math.floor(12000000 / pixels.data.byteLength)))) history.shift();
    revision++;
    dirty = true;
    update();
  }

  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || drawing) return;
    const start = point(event);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    if (tool === "fill") {
      if (fill(start, ink, context.getImageData(0, 0, canvas.width, canvas.height))) commit(pixels);
      return;
    }
    drawing = {start, last: start, pixels, pointer: event.pointerId, tool, ink};
    canvas.setPointerCapture(event.pointerId);
    if (tool === "pencil" || tool === "erase") stroke(start, start, tool, ink);
    update();
  });
  function drawTo(event) {
    if (drawing?.pointer !== event.pointerId) return;
    const next = point(event);
    if (drawing.last.x === next.x && drawing.last.y === next.y) return;
    const freehand = drawing.tool === "pencil" || drawing.tool === "erase";
    if (!freehand) context.putImageData(drawing.pixels, 0, 0);
    stroke(freehand ? drawing.last : drawing.start, next, drawing.tool, drawing.ink);
    drawing.last = next;
  }
  canvas.addEventListener("pointermove", drawTo);
  canvas.addEventListener("pointerup", event => {
    if (drawing?.pointer !== event.pointerId) return;
    drawTo(event);
    const {pixels} = drawing;
    drawing = null;
    commit(pixels);
  });
  canvas.addEventListener("lostpointercapture", event => {
    if (drawing?.pointer !== event.pointerId) return;
    context.putImageData(drawing.pixels, 0, 0);
    drawing = null;
    update();
  });

  win.paintSaveId = () => pendingSave;
  win.openPaintImage = (name, encoded) => confirmDiscard(() => {
    const request = ++incomingImage;
    const image = new Image();
    const startedAt = revision;
    image.onload = () => {
      if (openWindows.get(win.id) !== win || request !== incomingImage) return;
      if (startedAt === revision) reset(image.width, image.height, image, name);
      else confirmDiscard(() => reset(image.width, image.height, image, name));
    };
    image.onerror = () => announce("Could not open this picture.");
    image.src = "data:image/png;base64," + encoded;
  });
  win.beforeClose = () => {
    if (!dirty) return true;
    confirmDiscard(() => { dirty = false; closeWindow(win.id); });
    return false;
  };
  win.node.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && history.length && !drawing) {
      event.preventDefault();
      undo.click();
    }
  });
  surface.append(canvas);
  win.body.replaceChildren(menuBar, drawingBar, surface, palette, status);
  reset();
}

window.desktopPicture = (name, encoded) => openWindow("paint").openPaintImage(name, encoded);
