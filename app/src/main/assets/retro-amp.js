"use strict";

const retroAudio = {
  phase: "idle", problem: "", id: "", title: "", position: 0, duration: 0, volume: 75, repeat: "off",
  tracks: [], pendingPlay: false, bars: []
};
let meterListening = false;

function audioCommand(action, value = "") {
  if (native?.audioCommand) native.audioCommand(action, String(value));
  else announce("Playback is available in the Android launcher.");
}

function audioTime(ms) {
  const value = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
}

function syncAudioMeter() {
  const win = openWindows.get("$music");
  const visible = Boolean(win && !win.minimized && activeWindow === win.id && desktopVisible && !document.hidden &&
    !document.documentElement.classList.contains("saver-running"));
  if (visible === meterListening) return;
  meterListening = visible;
  native?.audioCommand?.("meter", visible ? "on" : "off");
}

function initializeAudioTray() {
  const tray = document.getElementById("now-playing");
  tray.append(retroIcon("music", 19));
  tray.addEventListener("click", () => openWindow("music"));
  tray.addEventListener("contextmenu", event => {
    event.preventDefault();
    const playing = retroAudio.phase === "playing" || retroAudio.pendingPlay;
    showMenu([
      ["Open RetroAMP", "music", () => openWindow("music")],
      [playing ? "Pause" : "Play", "", () => audioCommand("toggle")],
      ["Next Track", "", () => audioCommand("next")],
      ["Stop", "", () => audioCommand("stop")]
    ], event.clientX, event.clientY, tray);
  });
  document.addEventListener("visibilitychange", syncAudioMeter);
}

window.retroAudioEvent = update => {
  Object.assign(retroAudio, update, {bars: Array.isArray(update.bars) ? update.bars : []});
  const tray = document.getElementById("now-playing");
  tray.hidden = !retroAudio.id;
  tray.title = "Now Playing" + (retroAudio.title ? " · " + retroAudio.title : "");
  tray.classList.toggle("audio-active", retroAudio.phase === "playing");
  openWindows.get("$music")?.updateAudio?.(Array.isArray(update.tracks));
  updateMusicChannel();
};

window.openRetroAudio = () => {
  openWindow("music");
};

function renderRetroAmp(win) {
  const shell = element("div", "retroamp");
  const deck = element("div", "amp-deck");
  const screen = element("div", "amp-screen");
  const title = element("div", "amp-title", "No track selected");
  const elapsed = element("span", "amp-time", "0:00");
  const total = element("span", "amp-duration", "/ 0:00");
  const clock = element("div", "amp-timing");
  const spectrum = element("div", "amp-spectrum");
  spectrum.setAttribute("aria-label", "Audio spectrum");
  spectrum.setAttribute("role", "img");
  const bands = Array.from({length: 12}, () => element("i", "amp-band"));
  spectrum.append(...bands);
  clock.append(elapsed, total, spectrum);
  const position = element("input", "amp-seek");
  position.type = "range";
  position.setAttribute("aria-label", "Playback position");
  position.min = "0";
  position.step = "1";
  position.max = "0";
  let dragging = false;
  position.addEventListener("pointerdown", () => { dragging = true; });
  position.addEventListener("pointercancel", () => { dragging = false; win.updateAudio(); });
  position.addEventListener("input", () => { elapsed.textContent = audioTime(position.value); });
  position.addEventListener("change", () => {
    dragging = false;
    audioCommand("seek", position.value);
  });
  position.addEventListener("pointerup", () => { dragging = false; });
  screen.append(title, clock, position);

  const transport = element("div", "amp-transport");
  const previous = toolbarButton("", () => audioCommand("previous"));
  previous.append(element("span", "amp-skip-symbol amp-back"));
  previous.setAttribute("aria-label", "Previous track");
  previous.title = "Previous track";
  const play = toolbarButton("Play", () => audioCommand("toggle"));
  const stop = toolbarButton("Stop", () => audioCommand("stop"));
  const next = toolbarButton("", () => audioCommand("next"));
  next.append(element("span", "amp-skip-symbol amp-next"));
  next.setAttribute("aria-label", "Next track");
  next.title = "Next track";
  const repeat = toolbarButton("Repeat Off", () => audioCommand("repeat"));
  const level = element("label", "amp-volume", "Volume");
  const volume = element("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.addEventListener("input", () => audioCommand("volume", volume.value));
  level.append(volume);
  transport.append(previous, play, stop, next, repeat, level);
  deck.append(screen, transport);

  const section = element("div", "amp-playlist");
  const playlist = element("div", "amp-entries");
  playlist.setAttribute("aria-label", "Playlist");
  const controls = element("div", "amp-playlist-tools");
  const add = toolbarButton("Add Tracks…", () => audioCommand("choose"));
  const clear = toolbarButton("Clear Playlist…", () => {
    dialog({kind: "audio-clear", title: "Clear Playlist", icon: "music",
      message: "Remove all tracks from this playlist?", accept: "Clear", cancel: "Cancel",
      onAccept: () => audioCommand("clear")});
  });
  controls.append(element("div", "amp-section-title", "Playlist"), add, clear);
  section.append(controls, playlist);
  const status = appStatus("0 tracks");
  shell.append(deck, section, status);
  win.body.replaceChildren(shell);
  win.node.classList.add("amp-window");

  function renderPlaylist() {
    const rows = retroAudio.tracks.map((track, index) => {
      const row = element("div", "amp-row");
      row.dataset.track = track.id;
      const select = button(null, () => audioCommand("track", track.id), "amp-track");
      select.title = track.name;
      select.append(element("span", "amp-number", String(index + 1).padStart(2, "0")),
        element("span", "amp-track-title", track.name));
      const remove = button("×", () => audioCommand("remove", track.id), "amp-remove");
      remove.setAttribute("aria-label", "Remove " + track.name);
      row.append(select, remove);
      return row;
    });
    if (!rows.length) rows.push(element("div", "amp-empty", "Add tracks to start a playlist."));
    playlist.replaceChildren(...rows);
  }

  let highlighted = null;
  win.updateAudio = (rebuild = false) => {
    if (rebuild) renderPlaylist();
    if (highlighted !== retroAudio.id || rebuild) {
      for (const row of playlist.querySelectorAll("[data-track]")) {
        const current = row.dataset.track === retroAudio.id;
        row.classList.toggle("amp-current", current);
        row.querySelector(".amp-track").setAttribute("aria-pressed", String(current));
      }
      highlighted = retroAudio.id;
    }
    title.textContent = retroAudio.title || "No track selected";
    title.title = retroAudio.title;
    if (!dragging) {
      position.max = String(retroAudio.duration);
      position.value = String(retroAudio.position);
      elapsed.textContent = audioTime(retroAudio.position);
    }
    position.disabled = retroAudio.duration <= 0 || retroAudio.phase === "loading";
    total.textContent = "/ " + audioTime(retroAudio.duration);
    const running = retroAudio.phase === "playing";
    play.textContent = running || retroAudio.pendingPlay ? "Pause" : "Play";
    const index = retroAudio.tracks.findIndex(track => track.id === retroAudio.id);
    const hasTracks = retroAudio.tracks.length > 0;
    play.disabled = clear.disabled = !hasTracks;
    previous.disabled = !hasTracks || (index <= 0 && retroAudio.repeat !== "all" && !(running && retroAudio.position > 2600));
    next.disabled = !hasTracks || (index === retroAudio.tracks.length - 1 && retroAudio.repeat !== "all");
    stop.disabled = !retroAudio.id || retroAudio.phase === "stopped";
    repeat.textContent = {"all": "Repeat All", "one": "Repeat One"}[retroAudio.repeat] || "Repeat Off";
    repeat.setAttribute("aria-pressed", String(retroAudio.repeat !== "off"));
    if (document.activeElement !== volume) volume.value = String(retroAudio.volume);
    const statusText = retroAudio.problem || {
      playing: "Playing", paused: "Paused", loading: "Opening track…", stopped: "Stopped", ended: "End of playlist"
    }[retroAudio.phase] || "";
    status.textContent = [objectCountTracks(retroAudio.tracks.length), statusText].filter(Boolean).join(" · ");
    for (let index = 0; index < bands.length; index++) {
      const level = running ? Number(retroAudio.bars[index]) || 0 : 0;
      bands[index].style.setProperty("--level", clamp(level, 0, 100) + "%");
    }
    spectrum.classList.toggle("amp-live", running && retroAudio.bars.length > 0);
  };
  win.cleanup = () => {
    if (meterListening) native?.audioCommand?.("meter", "off");
    meterListening = false;
  };
  win.updateAudio(true);
  native?.audioCommand?.("status", "");
}

function objectCountTracks(count) {
  return count + (count === 1 ? " track" : " tracks");
}
