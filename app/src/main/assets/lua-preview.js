"use strict";

const activeLuaProjects = new Map();

function launchLuaProject(project, callbacks) {
  const session = luaSession();
  const originals = new Map(project.forms.map(form => [form.name, form]));
  const states = new Map(project.forms.map(form => [form.name, JSON.parse(JSON.stringify(form))]));
  const windows = new Map();
  const changes = new Map();
  const queue = [];
  // Modal windows are managed per Lua session, not as global Android windows.
  // Only the top modal form receives user input until it is hidden/unloaded.
  const modalOrder = [];
  const topModal = () => modalOrder.at(-1) || "";
  let busy = true;
  let ended = false;
  let paused = false;

  function dispatch() {
    if (busy || ended || paused || !queue.length) return;
    const event = queue.shift();
    const updates = Object.fromEntries(changes.get(event.form) || []);
    changes.delete(event.form);
    busy = true;
    native.luaCommand("event", session, JSON.stringify({...event, updates}));
  }

  function sendEvent(form, name, event, args = null) {
    if (ended || (topModal() && form !== topModal()) ||
        (event === "Timer" && (paused || busy || !desktopVisible || document.hidden))) return;
    if (queue.length >= 32) {
      announce("Lua’s event queue is full.");
      return;
    }
    // While Lua is busy, repeated Change events for a control are represented by
    // one pending event; writeInput() retains the latest value.
    if (event === "Change" && queue.some(item => item.form === form && item.name === name && item.event === "Change")) {
      return;
    }
    queue.push({form, name, event, ...(args ? {args} : {})});
    dispatch();
  }

  function writeInput(form, name, value) {
    if (!changes.has(form)) changes.set(form, new Map());
    changes.get(form).set(name, value);
  }

  function show(form) {
    const model = states.get(form);
    if (!model) return;
    const existing = windows.get(form);
    const id = "$lua-preview:" + session + ":" + form;
    if (existing) {
      openWindow("lua-preview", id, existing.options);
      return;
    }
    const win = openWindow("lua-preview", id, {
      form: model, session, sendEvent, writeInput,
      onClose: () => sendEvent(form, "", "CloseForm")
    });
    windows.set(form, win);
    if (model.position === "manual") {
      win.x = model.left;
      win.y = model.top;
      placeWindow(win);
    }
    win.refreshLuaForm(busy || paused, "");
  }

  function hide(form) {
    const win = windows.get(form);
    if (!win) return;
    windows.delete(form);
    const modalIndex = modalOrder.indexOf(form);
    if (modalIndex >= 0) modalOrder.splice(modalIndex, 1);
    win.luaClosing = true;
    closeWindow(win.id);
  }

  function stop() {
    if (!ended) native.luaCommand("stop", session, "");
    ended = true;
    for (const form of windows.keys()) hide(form);
    activeLuaProjects.delete(session);
    callbacks.onEnd?.();
  }

  function reply(result) {
    if (result.session !== session || ended) return;
    if (result.type === "pause") {
      paused = true;
      for (const win of windows.values()) win.refreshLuaForm(true, "Paused in Lua Studio");
      callbacks.onPause?.(result);
      return;
    }
    busy = false;
    paused = false;
    if (result.output?.length) callbacks.onLog?.(result.output);
    if (result.error) callbacks.onError?.(result.error);
    if (result.ended) {
      ended = true;
      activeLuaProjects.delete(session);
      if (callbacks.closeOnError) { stop(); return; }
      const status = (result.error || "Lua stopped.").split("\n")[0];
      if (windows.size) {
        for (const win of windows.values()) {
          win.luaDead = true;
          win.refreshLuaForm(true, status);
        }
      }
      callbacks.onEnd?.();
      return;
    }
    const presentation = new Map();
    for (const operation of result.navigation || []) {
      const key = operation.form;
      if (!originals.has(key)) continue;
      presentation.delete(key);
      presentation.set(key, operation.action);
      if (operation.action === "modal") {
        const old = modalOrder.indexOf(key);
        if (old >= 0) modalOrder.splice(old, 1);
        modalOrder.push(key);
      }
      if (operation.action === "hide" || operation.action === "unload") {
        hide(key);
        if (operation.action === "unload") {
          states.set(key, JSON.parse(JSON.stringify(originals.get(key))));
          changes.delete(key);
        }
        for (let index = queue.length - 1; index >= 0; index--) {
          if (queue[index].form === key) queue.splice(index, 1);
        }
      }
    }
    for (const [key, changesByControl] of Object.entries(result.patches || {})) {
      const model = states.get(key);
      if (!model) continue;
      for (const [name, patch] of Object.entries(changesByControl)) {
        const control = model.controls.find(entry => entry.name === name);
        if (!control) continue;
        for (const property of ["text", "checked", "value", "interval", "enabled", "visible"]) {
          if (Object.prototype.hasOwnProperty.call(patch, property) &&
              !(property === luaInputProperty(control) && changes.get(key)?.has(name))) {
            control[property] = patch[property];
          }
        }
      }
    }
    for (const [key, action] of presentation) {
      if (action === "show" || action === "modal") show(key);
    }
    const status = result.error ? result.error.split("\n")[0] : result.message || "Running";
    if (result.message) announce("Lua: " + result.message);
    for (const win of windows.values()) {
      const blockedByModal = !!topModal() && win.options.form.name !== topModal();
      win.refreshLuaForm(blockedByModal, blockedByModal ? "A modal dialog is open" : status);
    }
    if (!windows.size) stop();
    else dispatch();
  }

  const host = {
    get paused() { return paused; },
    start() {
      activeLuaProjects.set(session, host);
      show(project.startup);
      native.luaCommand("start", session, JSON.stringify({...project,
        _debug: {breakpoints: callbacks.breakpoints, watches: callbacks.watches, step: callbacks.step}}));
    },
    reply, stop,
    activate() {
      if (ended) return false;
      const first = windows.get(project.startup) || windows.values().next().value;
      if (first) show(first.options.form.name);
      return true;
    },
    resume(action) {
      if (!paused || ended) return false;
      paused = false;
      native.luaCommand("resume", session, action);
      return true;
    }
  };
  return host;
}

function renderLuaPreview(win) {
  const form = win.options.form;
  const viewport = element("div", "lua-runtime-viewport");
  const surface = element("div", "lua-runtime-surface");
  const status = appStatus("Starting Lua…");
  const menuBar = element("div", "window-menubar lua-runtime-menu");
  const controls = new Map();
  const timers = new Map();
  const optionGroups = new Set();
  surface.tabIndex = 0;
  surface.style.width = form.width + "px";
  surface.style.height = form.height + "px";
  surface.style.backgroundColor = form.color;
  viewport.setAttribute("aria-label", "Form preview");
  viewport.append(surface);
  viewport.style.backgroundColor = form.color;

  const send = (name, action, args) => win.options.sendEvent(form.name, name, action, args);
  const pointerArgs = (event, bounds) => ({
    x: Math.round(event.clientX - bounds.left), y: Math.round(event.clientY - bounds.top),
    button: event.button, shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey
  });
  const keyboardArgs = event => ({key: event.key.slice(0, 30), code: event.code.slice(0, 40),
    shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey});
  for (const menu of form.menus) {
    const action = menu.items.length
      ? windowMenu(menu.caption, menu.items.map(item => [item.caption, "", () => send(item.name, "Menu"), !item.enabled]))
      : button(menu.caption, () => send(menu.name, "Menu"), "");
    action.disabled = !menu.enabled;
    menuBar.append(action);
  }

  for (const control of form.controls) {
    if (control.type === "timer") continue;
    const shell = element("div", "lua-control lua-live-control");
    shell.classList.toggle("lua-frame-control", control.type === "frame");
    Object.assign(shell.style, {left: control.x + "px", top: control.y + "px",
      width: control.width + "px", height: control.height + "px"});
    const parts = luaObjectNode(control);
    const inputProperty = luaInputProperty(control);
    shell.addEventListener("click", event => send(control.name, "Click", pointerArgs(event, shell.getBoundingClientRect())));
    shell.addEventListener("dblclick", event => send(control.name, "DblClick", pointerArgs(event, shell.getBoundingClientRect())));
    shell.addEventListener("pointerdown", event => send(control.name, "MouseDown", pointerArgs(event, shell.getBoundingClientRect())));
    shell.addEventListener("pointerup", event => send(control.name, "MouseUp", pointerArgs(event, shell.getBoundingClientRect())));
    if (control.type === "option") {
      parts.input.name = win.options.session + "-" + form.name + "-" + control.group;
      if (control.checked && optionGroups.has(control.group)) control.checked = false;
      if (control.checked) optionGroups.add(control.group);
    }
    if (parts.input) {
      const readInput = () => {
        const value = inputProperty === "checked" ? parts.input.checked :
          luaRangeTypes.includes(control.type) ? Number(parts.input.value) : parts.input.value;
        if (control.type === "option" && value) {
          for (const peer of form.controls) {
            if (peer !== control && peer.type === "option" && peer.group === control.group) peer.checked = false;
          }
        }
        if (control[inputProperty] !== value) {
          control[inputProperty] = value;
          win.options.writeInput(form.name, control.name, value);
        }
      };
      parts.input.addEventListener("input", () => {
        const previous = control[inputProperty];
        readInput();
        // VB6 TextBox_Change fires when the user edits the field, not only on blur.
        if (luaTextTypes.includes(control.type) && previous !== control[inputProperty]) {
          send(control.name, "Change");
        }
      });
      parts.input.addEventListener("change", () => {
        const previous = control[inputProperty];
        readInput();
        if (!luaTextTypes.includes(control.type) || previous !== control[inputProperty]) {
          send(control.name, "Change");
        }
      });
    }
    shell.append(parts.node);
    const focusable = control.type === "button" ? parts.node : parts.input;
    if (focusable && !control.tabStop) focusable.tabIndex = -1;
    if (focusable) {
      focusable.addEventListener("focus", () => send(control.name, "GotFocus"));
      focusable.addEventListener("blur", () => send(control.name, "LostFocus"));
      focusable.addEventListener("keydown", event => send(control.name, "KeyDown", keyboardArgs(event)));
      focusable.addEventListener("keyup", event => send(control.name, "KeyUp", keyboardArgs(event)));
    }
    controls.set(control.name, {shell, parts, focusable, control});
    surface.append(shell);
  }

  surface.addEventListener("click", event => {
    if (event.target === surface) send("", "Click", pointerArgs(event, surface.getBoundingClientRect()));
  });
  surface.addEventListener("dblclick", event => {
    if (event.target === surface) send("", "DblClick", pointerArgs(event, surface.getBoundingClientRect()));
  });
  surface.addEventListener("pointerdown", event => {
    if (event.target === surface) send("", "MouseDown", pointerArgs(event, surface.getBoundingClientRect()));
  });
  surface.addEventListener("pointerup", event => {
    if (event.target === surface) send("", "MouseUp", pointerArgs(event, surface.getBoundingClientRect()));
  });
  surface.addEventListener("keydown", event => {
    if (event.target === surface) send("", "KeyDown", keyboardArgs(event));
    if (event.key !== "Tab") return;
    const ordered = [...controls.values()].filter(entry =>
      entry.focusable && entry.control.visible && entry.control.enabled && entry.control.tabStop)
      .sort((first, second) => first.control.tabIndex - second.control.tabIndex);
    const index = ordered.findIndex(entry => entry.focusable === event.target);
    if (index >= 0 && ordered.length > 1) {
      const next = (index + ordered.length + (event.shiftKey ? -1 : 1)) % ordered.length;
      event.preventDefault();
      ordered[next].focusable.focus();
    }
  });

  surface.addEventListener("keyup", event => {
    if (event.target === surface) send("", "KeyUp", keyboardArgs(event));
  });

  function synchronizeTimers(disabled) {
    for (const control of form.controls) {
      if (control.type !== "timer") continue;
      const active = timers.get(control.name);
      if (active && (disabled || !control.enabled || active.interval !== control.interval)) {
        clearInterval(active.id);
        timers.delete(control.name);
      }
      if (!disabled && control.enabled && !timers.has(control.name)) {
        const id = setInterval(() => send(control.name, "Timer"), control.interval);
        timers.set(control.name, {id, interval: control.interval});
      }
    }
  }

  win.refreshLuaForm = (inactive, message) => {
    for (const control of form.controls) {
      const entry = controls.get(control.name);
      if (!entry) continue;
      entry.shell.hidden = !control.visible;
      updateLuaObject(control, entry.parts, false);
    }
    surface.inert = menuBar.inert = inactive;
    if (message) status.textContent = message;
    synchronizeTimers(inactive);
  };

  function layoutPreview() {
    const scale = Math.min(1, Math.max(1, viewport.clientWidth - 12) / form.width);
    surface.style.zoom = String(scale);
  }

  win.body.replaceChildren(...(form.menus.length ? [menuBar] : []), viewport, status);
  win.refreshLuaForm(true, "");
  const observer = new ResizeObserver(layoutPreview);
  observer.observe(viewport);
  win.beforeClose = () => {
    if (win.luaClosing || win.luaDead) return true;
    win.options.onClose();
    return false;
  };
  win.cleanup = () => {
    observer.disconnect();
    for (const entry of timers.values()) clearInterval(entry.id);
  };
}

window.luaRuntimeEvent = result => activeLuaProjects.get(result.session)?.reply(result);
