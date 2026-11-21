"use strict";

const canvas = document.getElementById("screen");
const painter = canvas.getContext("2d", {alpha:false});
const form = document.getElementById("type");
const command = document.getElementById("command");
const status = document.getElementById("status");
const pauseButton = document.getElementById("pause");
const audioButton = document.getElementById("audio");
const testAudioButton = document.getElementById("test-audio");
const saveButton = document.getElementById("save");
const rightClick = document.getElementById("right-click");
const search = new URLSearchParams(location.search);
let emulator = null, picture = null, active = true, paused = false, cacheKey = "", sound = null, soundAt = 0, typing = false;
let audioEnabled = false;
let audioOptOut = false;
let audioUnlockPromise = null;
const AUDIO_MAX_AHEAD = 0.28;
const AUDIO_LEAD = 0.02;
const held = new Set();
const mouseButtons = new Map();
const inputSources = new Map();
function sendVirtual(code, down) {
  if (code === -1 || code === -2) emulator?.sendMouseButton(-code - 1, down);
  else sendKey(code, down);
}
function setInputSource(source, code, down) {
  const previous = inputSources.get(source);
  if (previous !== undefined && (!down || previous !== code)) {
    inputSources.delete(source);
    if (![...inputSources.values()].includes(previous)) sendVirtual(previous, false);
  }
  if (down && code && !inputSources.has(source)) {
    const alreadyHeld = [...inputSources.values()].includes(code);
    inputSources.set(source, code);
    if (!alreadyHeld) sendVirtual(code, true);
  }
}

const controls = [...document.querySelectorAll("button"), command];

function message(text) {
  status.textContent = text;
  window.RetroDosBox?.status(text);
}

function sendKey(code, down) {
  if (!emulator || !code) return;
  if (down) held.add(code);
  else held.delete(code);
  emulator.sendKeyEvent(code, down);
}

function releaseKeys() {
  for (const key of held) emulator?.sendKeyEvent(key, false);
  held.clear();
  for (const value of new Set(inputSources.values())) if (value < 0) sendVirtual(value, false);
  inputSources.clear();
  for (const button of mouseButtons.values()) emulator?.sendMouseButton(button, false);
  mouseButtons.clear();
}

function updatePause() {
  if (!emulator) return;
  if (paused || !active || window.RetroDosDeluxe?.isSettingsOpen()) {
    releaseKeys();
    emulator.pause();
    soundAt = 0;
    sound?.suspend().catch(() => {});
  } else {
    emulator.resume();
    if (audioEnabled) sound?.resume().then(() => { soundAt = 0; }).catch(() => {
      message("Tap Enable Sound to resume Android audio.");
    });
  }
}

window.dosboxVisible = showing => {
  active = showing;
  window.RetroDosDeluxe?.visibleChanged(showing);
  updatePause();
};

const codes = {Escape:256, Enter:257, Tab:258, Backspace:259, Insert:260, Delete:261,
  ArrowRight:262, ArrowLeft:263, ArrowDown:264, ArrowUp:265, PageUp:266, PageDown:267, Home:268, End:269,
  CapsLock:280, ScrollLock:281, NumLock:282, PrintScreen:283, Pause:284, ShiftLeft:340, ShiftRight:344,
  ControlLeft:341, ControlRight:345, AltLeft:342, AltRight:346, Space:32, Backquote:96, Minus:45, Equal:61,
  Backslash:92, BracketLeft:91, BracketRight:93, Semicolon:59, Quote:39, Period:46, Comma:44, Slash:47,
  NumpadDecimal:330, NumpadDivide:331, NumpadMultiply:332, NumpadSubtract:333, NumpadAdd:334, NumpadEnter:335};

function keyCode(code) {
  if (Object.prototype.hasOwnProperty.call(codes, code)) return codes[code];
  if (/^(Key[A-Z]|Digit[0-9])$/.test(code)) return code.charCodeAt(code.length - 1);
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) return 289 + Number(code.slice(1));
  if (/^Numpad[0-9]$/.test(code)) return 320 + Number(code.slice(-1));
  return 0;
}

for (const eventName of ["keydown", "keyup"]) {
  document.addEventListener(eventName, event => {
    if (event.target === command || !emulator || window.RetroDosDeluxe?.isSettingsOpen() || event.target.closest("input,select,textarea") || (event.target.matches("button") && ["Enter","Space"].includes(event.code))) return;
    const code = keyCode(event.code);
    if (!code) return;
    event.preventDefault();
    setInputSource("kbd:"+event.code, code, eventName === "keydown");
  });
}
window.addEventListener("blur", releaseKeys);

for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", event => {
    button.setPointerCapture(event.pointerId);
    setInputSource("button:" + event.pointerId, Number(button.dataset.key), true);
  });
  for (const eventName of ["pointerup","pointercancel","lostpointercapture"]) {
    button.addEventListener(eventName, event => setInputSource("button:" + event.pointerId, 0, false));
  }
  button.addEventListener("click", event => {
    if (event.detail === 0) emulator?.simulateKeyPress(Number(button.dataset.key));
  });
}

function mouse(event) {
  const box = canvas.getBoundingClientRect();
  const scale = Math.min(box.width / canvas.width, box.height / canvas.height);
  if (!scale) return;
  const x = (event.clientX - box.left - (box.width - canvas.width * scale) / 2) / (canvas.width * scale);
  const y = (event.clientY - box.top - (box.height - canvas.height * scale) / 2) / (canvas.height * scale);
  emulator?.sendMouseMotion(Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y)));
}
canvas.addEventListener("pointermove", mouse);
canvas.addEventListener("contextmenu", event => event.preventDefault());
rightClick.addEventListener("click", () => {
  rightClick.setAttribute("aria-pressed", rightClick.getAttribute("aria-pressed") !== "true");
});
canvas.addEventListener("pointerdown", event => {
  canvas.focus();
  canvas.setPointerCapture(event.pointerId);
  mouse(event);
  const useRightButton = rightClick.getAttribute("aria-pressed") === "true" || event.button === 2;
  const button = useRightButton ? 1 : event.button === 1 ? 2 : 0;
  rightClick.setAttribute("aria-pressed", "false");
  mouseButtons.set(event.pointerId, button);
  emulator?.sendMouseButton(button, true);
});
for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(eventName, event => {
    const button = mouseButtons.get(event.pointerId);
    if (button === undefined) return;
    emulator?.sendMouseButton(button, false);
    mouseButtons.delete(event.pointerId);
  });
}

function textKey(char) {
  if (/^[a-zA-Z0-9 ]$/.test(char)) return [char.toUpperCase().charCodeAt(0), /^[A-Z]$/.test(char)];
  const plain = String.fromCharCode(96) + "-=[]\\;',./";
  const shift = '~_+{}|:"<>?';
  const digitShift = ")!@#$%^&*(";
  if (plain.includes(char)) return [char.charCodeAt(0),false];
  if (shift.includes(char)) return [plain.charCodeAt(shift.indexOf(char)),true];
  if (digitShift.includes(char)) return [48 + digitShift.indexOf(char),true];
  return null;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!emulator || typing || paused) return;
  const keys = [...command.value].map(textKey);
  if (keys.some(key => key === null)) { message("Use standard DOS keyboard characters."); return; }
  const session = emulator;
  typing = true;
  command.value = "";
  command.blur();
  try {
    for (const [key, shift] of keys) {
      if (session !== emulator || !active || paused) return;
      if (shift) emulator.simulateKeyPress(340, key);
      else emulator.simulateKeyPress(key);
      await new Promise(resolve => setTimeout(resolve, 29));
    }
    if (session === emulator && active && !paused) emulator.simulateKeyPress(257);
  } finally { typing = false; }
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  updatePause();
});

function setAudioButton() {
  audioButton.textContent = audioEnabled ? "Sound On" : "Enable Sound";
  audioButton.setAttribute("aria-pressed", String(audioEnabled));
  audioButton.setAttribute("aria-label", audioEnabled ? "Mute DOSBox sound" : "Enable DOSBox sound");
}

// Android WebView requires a gesture *inside this WebView* before audio can start.
// The outer launcher's Play action is not sufficient to unlock its AudioContext.
async function enableAudio() {
  if (audioEnabled && sound?.state === "running") return true;
  if (audioUnlockPromise) return audioUnlockPromise;
  audioUnlockPromise = (async () => {
    try {
      if (!sound) sound = new (window.AudioContext || window.webkitAudioContext)({latencyHint:"interactive"});
      await sound.resume();
      if (sound.state !== "running") throw Error("Audio output is blocked");
      audioEnabled = true;
      audioOptOut = false;
      soundAt = 0;
      setAudioButton();
      message("Sound on · SB16: A220 IRQ7 DMA1 HDMA5 · AdLib/OPL3 music");
      return true;
    } catch (error) {
      audioEnabled = false;
      setAudioButton();
      message("Android blocked sound. Tap Enable Sound or check media volume.");
      return false;
    }
  })();
  try { return await audioUnlockPromise; }
  finally { audioUnlockPromise = null; }
}

async function disableAudio() {
  audioEnabled = false;
  audioOptOut = true;
  soundAt = 0;
  setAudioButton();
  if (sound) await sound.suspend().catch(() => {});
  message("DOSBox sound muted.");
}

audioButton.addEventListener("click", () => {
  if (audioEnabled) disableAudio();
  else enableAudio();
});

// A short, original synthesized tone confirms the phone's WebAudio output,
// separately from whether the DOS game's setup has selected Sound Blaster.
testAudioButton.addEventListener("click", async () => {
  if (!await enableAudio()) return;
  const oscillator = sound.createOscillator();
  const volume = sound.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 523.25;
  volume.gain.setValueAtTime(0.0001, sound.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.11, sound.currentTime + 0.018);
  volume.gain.exponentialRampToValueAtTime(0.0001, sound.currentTime + 0.25);
  oscillator.connect(volume).connect(sound.destination);
  oscillator.start();
  oscillator.stop(sound.currentTime + 0.27);
  message("Speaker test playing. For game sound choose Sound Blaster 16: 220 / 7 / 1 / 5.");
});

// The first touch on the game screen/keyboard unlocks Android's Web Audio.
// Audio remains opt-out using the Sound On toggle.
for (const target of [canvas, document.getElementById("keys"), command]) {
  target.addEventListener("pointerdown", () => {
    if (!audioEnabled && !audioOptOut && !audioUnlockPromise) void enableAudio();
  }, {passive:true});
}

function playSound(samples) {
  if (!emulator || !audioEnabled || !sound || sound.state !== "running" ||
      !samples || !samples.length || !active || paused || window.RetroDosDeluxe?.isSettingsOpen()) return;
  const frequency = emulator.soundFrequency();
  if (!Number.isFinite(frequency) || frequency < 8000 || frequency > 192000) return;
  const now = sound.currentTime;
  // Never grow unbounded audio latency. When the emulator has fallen behind,
  // align the next buffer with real time instead of permanently dropping sound.
  if (!Number.isFinite(soundAt) || soundAt < now || soundAt > now + AUDIO_MAX_AHEAD) soundAt = now + AUDIO_LEAD;
  const buffer = sound.createBuffer(1, samples.length, frequency);
  buffer.copyToChannel(samples, 0);
  const track = sound.createBufferSource();
  track.buffer = buffer;
  track.connect(sound.destination);
  track.start(soundAt);
  soundAt += buffer.duration;
  track.onended = () => track.disconnect();
}

function cache(operation, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("retro-dosbox-games", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("disks");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("disks", operation === "read" ? "readonly" : "readwrite");
      const store = transaction.objectStore("disks");
      const request = operation === "read" ? store.get(cacheKey) : store.put(value, cacheKey);
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  });
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  try {
    const archive = await emulator.persist(false);
    if (!(archive instanceof Uint8Array) || archive.byteLength > 96 * 1024 * 1024) throw Error();
    await cache("save", archive);
    message("DOS game files saved.");
  } catch (error) { message("Could not save this DOS disk."); }
  finally { saveButton.disabled = false; }
});

function frameSize(width, height) {
  if (width < 1 || height < 1 || width > 1920 || height > 1200) return;
  canvas.width = width; canvas.height = height;
  picture = painter.createImageData(width, height);
}

function monitor(rgb, rgba) {
  if (!picture) return;
  if (rgba && rgba.byteLength === picture.data.length) picture.data.set(rgba);
  else if (rgb && rgb.byteLength * 4 === picture.data.length * 3) {
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      picture.data[j] = rgb[i]; picture.data[j + 1] = rgb[i + 1]; picture.data[j + 2] = rgb[i + 2]; picture.data[j + 3] = 255;
    }
  } else return;
  painter.putImageData(picture, 0, 0);
}

// Imported js-dos packages sometimes disable their mixer or Sound Blaster.
// Preserve their other options and autoexec scripts while applying a consistent
// SB16 profile. The classic DOSBox defaults are I/O 220, IRQ 7, DMA 1, HDMA 5.
function configureSoundBlaster(source) {
  let conf = typeof source === "string" ? source : "";
  function option(section, key, value) {
    const pattern = new RegExp("(^\\[" + section + "\\]\\s*\\n)([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))", "mi");
    const match = pattern.exec(conf);
    if (!match) {
      // Insert before autoexec so imported startup scripts remain untouched.
      const idx = conf.search(/^\[autoexec\]/mi);
      const block = `[${section}]\n${key}=${value}\n\n`;
      conf = idx < 0 ? conf + "\n" + block : conf.slice(0, idx) + block + conf.slice(idx);
      return;
    }
    let body = match[2];
    const setting = new RegExp("^\\s*" + key + "\\s*=.*$", "mi");
    body = setting.test(body) ? body.replace(setting, key + "=" + value) : key + "=" + value + "\n" + body;
    conf = conf.slice(0, match.index) + match[1] + body + conf.slice(match.index + match[0].length);
  }
  for (const [key, value] of Object.entries({nosound:"false",rate:"44100"})) option("mixer",key,value);
  for (const [key, value] of Object.entries({sbtype:"sb16",sbbase:"220",irq:"7",dma:"1",hdma:"5",sbmixer:"true",oplmode:"auto",oplemu:"default",oplrate:"44100"})) option("sblaster",key,value);
  return conf;
}

async function start() {
  controls.forEach(control => { control.disabled = true; });
  try {
    emulators.pathPrefix = "/engine/";
    const demo = !search.has("archive");
    const bundle = await emulators.bundle();
    bundle.autoexec(demo ? "HELLO.COM" : search.get("start") || "DIR /P");
    const input = [];
    let config = {dosboxConf:bundle.dosboxConf,jsdosConf:bundle.jsdosConf};
    if (demo) {
      // Tiny original DOS program that prints a welcome using INT 21h.
      const text = new TextEncoder().encode("Retro Desktop 98 DOSBox demo!\r\nType DIR to see HELLO.COM, or run it again.\r\n$");
      const com = new Uint8Array(12 + text.length);
      com.set([0xba,0x0c,0x01,0xb4,0x09,0xcd,0x21,0xb8,0x00,0x4c,0xcd,0x21]);
      com.set(text, 12);
      cacheKey = "demo-v1";
      input.push({path:"HELLO.COM",contents:com});
    } else {
      const response = await fetch("/game/" + encodeURIComponent(search.get("archive")));
      if (!response.ok) throw Error("Game package could not be read.");
      const data = new Uint8Array(await response.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      cacheKey = Array.from(digest, byte => byte.toString(16).padStart(2,"0")).join("");
      config = await emulators.bundleConfig(data) || config;
      input.push(data);
    }
    try {
      const saved = await cache("read");
      if (saved instanceof Uint8Array) input.splice(0, input.length, saved);
    } catch (error) { /* A fresh DOS session is available if storage is disabled. */ }
    window.RetroDosDeluxe?.loadProfile(cacheKey);
    input.push(config);
    config.dosboxConf = configureSoundBlaster(config.dosboxConf);
    config.dosboxConf = window.RetroDosDeluxe?.configure(config.dosboxConf) || config.dosboxConf;
    emulator = await emulators.dosboxWorker(input);
    const events = emulator.events();
    frameSize(Math.max(1,emulator.width()),Math.max(1,emulator.height()));
    events.onFrameSize(frameSize);
    events.onFrame(monitor);
    events.onSoundPush(playSound);
    events.onExit(() => {
      emulator = null;
      controls.forEach(control => { control.disabled = true; });
      message("DOS session ended.");
    });
    try { const image = await emulator.screenshot(); if (image.width > 0) painter.putImageData(image,0,0); } catch (error) { }
    controls.forEach(control => { control.disabled = false; });
    updatePause();
    window.RetroDosDeluxe?.started();
    message(demo ? "DOSBox demo ready." : "DOSBox ready.");
  } catch (error) {
    console.error(error);
    message("DOSBox could not start this package.");
  }
}

start();
