"use strict";

const recording = {phase: "idle", problem: "", id: "", duration: 0, peaks: []};
let trimId = "";
let trimStart = 0;
let trimEnd = 0;
let waveSaveSequence = 0;

function recorderCommand(action, options) {
  if (!native?.recorderCommand) {
    announce("Microphone recording is available in the Android launcher.");
    return;
  }
  native.recorderCommand(action, options ? JSON.stringify(options) : "");
}

function recordingTime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 100));
  return Math.floor(total / 600) + ":" + String(Math.floor(total / 10) % 60).padStart(2, "0") + "." + total % 10;
}

window.recorderEvent = update => {
  Object.assign(recording, update);
  if (recording.id && trimId !== recording.id) {
    trimId = recording.id;
    trimStart = 0;
    trimEnd = recording.duration;
  }
  openWindows.get("$recorder")?.refreshRecording?.();
};

function renderSoundRecorder(win) {
  const panel = element("div", "sound-recorder");
  const toolbar = element("div", "app-toolbar");
  const operations = element("div", "app-toolbar recorder-files");
  const screen = element("div", "recorder-screen sunken");
  const waveform = element("canvas", "recorder-wave");
  waveform.setAttribute("aria-label", "Recording waveform");
  waveform.setAttribute("role", "img");
  const readout = element("div", "recorder-readout");
  const stateLamp = element("span", "recorder-lamp");
  stateLamp.setAttribute("aria-hidden", "true");
  const time = element("output", "recorder-time", "0:00.0");
  readout.append(stateLamp, time);
  screen.append(waveform, readout);
  const trims = element("div", "recorder-trims");
  const status = appStatus("Ready");
  let saving = "";

  function selection() {
    return {start: trimStart, end: trimEnd};
  }

  function replace(message, action) {
    if (!recording.id) { action(); return; }
    dialog({kind: "recording-replace", title: "Sound Recorder", icon: "recorder", message,
      accept: "Replace Clip", cancel: "Cancel", onAccept: action});
  }

  const record = toolbarButton("Record", () => replace("Record a new clip and replace this draft?", () => recorderCommand("record")));
  record.classList.add("recorder-record");
  const play = toolbarButton("Play Selection", () => recorderCommand("preview", selection()));
  const stop = toolbarButton("Stop", () => recorderCommand("stop"));
  const reset = toolbarButton("New", () => replace("Clear this recording draft?", () => recorderCommand("new")));
  const save = toolbarButton("Save WAV", () => {
    if (saving || !native?.recorderCommand) return;
    saving = "wave:" + (++waveSaveSequence);
    save.disabled = true;
    win.finishRecordingSave = result => {
      if (result.id !== saving) return;
      saving = "";
      win.refreshRecording();
      if (result.message) status.textContent = result.message;
    };
    recorderCommand("save", {...selection(), request: saving});
  });
  const retro = toolbarButton("Open in RetroAMP", () => recorderCommand("retroamp", selection()));
  toolbar.append(reset, record, stop, play);
  operations.append(save, retro);

  function rangeField(label, callback) {
    const field = element("label", "recorder-range");
    const heading = element("span", "recorder-range-label", label);
    const output = element("span", "recorder-range-value");
    const input = element("input");
    input.type = "range";
    input.step = "1";
    input.min = "0";
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => { callback(Number(input.value)); updateTrim(); });
    field.append(heading, output, input);
    trims.append(field);
    return {input, output};
  }
  const begin = rangeField("Trim start", value => { trimStart = value; });
  const end = rangeField("Trim end", value => { trimEnd = value; });
  const all = toolbarButton("Select All", () => { trimStart = 0; trimEnd = recording.duration; updateTrim(); });
  trims.append(all);

  function updateTrim() {
    const duration = recording.duration;
    const haveClip = Boolean(recording.id);
    begin.input.max = String(haveClip ? Math.max(0, trimEnd - 1) : 0);
    begin.input.value = String(haveClip ? trimStart : 0);
    end.input.min = String(haveClip ? Math.min(duration, trimStart + 1) : 0);
    end.input.max = String(haveClip ? duration : 0);
    end.input.value = String(haveClip ? trimEnd : 0);
    begin.output.textContent = recordingTime(haveClip ? trimStart : 0);
    end.output.textContent = recordingTime(haveClip ? trimEnd : 0);
    draw();
  }

  function draw() {
    const context = waveform.getContext("2d");
    if (!context || !waveform.clientWidth) return;
    const scale = Math.min(2, devicePixelRatio || 1);
    const width = Math.max(1, Math.round(waveform.clientWidth * scale));
    const height = Math.max(1, Math.round(waveform.clientHeight * scale));
    if (waveform.width !== width) waveform.width = width;
    if (waveform.height !== height) waveform.height = height;
    context.fillStyle = "#07110b";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#214f30";
    context.beginPath();
    context.moveTo(0, Math.floor(height / 2) + 0.5);
    context.lineTo(width, Math.floor(height / 2) + 0.5);
    context.stroke();
    const bins = recording.peaks || [];
    const live = recording.phase === "recording";
    const left = recording.duration > 0 ? trimStart / recording.duration : 0;
    const right = recording.duration > 0 ? trimEnd / recording.duration : 0;
    if (recording.id) {
      context.fillStyle = "#21412b";
      context.fillRect(width * left, 0, width * (right - left), height);
    }
    const step = width / Math.max(1, bins.length);
    for (let index = 0; index < bins.length; index++) {
      const heightOfPeak = Math.max(scale, height * 0.90 * Math.sqrt(clamp(bins[index], 0, 100) / 100));
      const selected = recording.id && (index + 0.5) / bins.length >= left && (index + 0.5) / bins.length <= right;
      context.fillStyle = live ? "#89f479" : selected ? "#b2ff9b" : "#436c47";
      context.fillRect(Math.floor(index * step), (height - heightOfPeak) / 2, Math.max(1, Math.floor(step - 1)), heightOfPeak);
    }
  }

  win.refreshRecording = () => {
    const phase = recording.phase;
    const busy = ["starting", "recording", "finishing", "loading", "working", "permission"].includes(phase);
    const active = ["starting", "recording"].includes(phase);
    const canTrim = Boolean(recording.id) && !busy && phase !== "preview";
    record.disabled = busy;
    play.disabled = retro.disabled = !canTrim;
    save.disabled = !canTrim || Boolean(saving);
    reset.disabled = busy || !recording.id;
    stop.disabled = !active && phase !== "preview";
    begin.input.disabled = end.input.disabled = all.disabled = !canTrim;
    time.textContent = recordingTime(recording.duration);
    stateLamp.classList.toggle("recorder-lamp-on", phase === "recording");
    status.textContent = recording.problem || {
      starting: "Starting microphone…", recording: "Recording…", finishing: "Finishing recording…",
      preview: "Playing selection", working: "Preparing selection…", loading: "Opening recording draft…",
      permission: "Waiting for microphone permission…", ready: "Select the part to play or save."
    }[phase] || "Press Record to capture a clip.";
    updateTrim();
  };

  panel.append(toolbar, screen, trims, operations, status);
  win.body.replaceChildren(panel);
  const observer = new ResizeObserver(draw);
  observer.observe(waveform);
  win.cleanup = () => {
    observer.disconnect();
    native?.recorderCommand?.("stop", "");
  };
  win.refreshRecording();
  native?.recorderCommand?.("status", "");
}
