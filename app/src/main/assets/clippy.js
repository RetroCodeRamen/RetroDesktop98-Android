"use strict";

const clippyPanel = document.getElementById("clippy-panel");
const clippyButton = document.getElementById("clippy-button");
const clippyInput = document.getElementById("clippy-question");
const clippyLog = document.getElementById("clippy-log");
const clippyStatus = document.getElementById("clippy-status");
const clippyProgress = document.getElementById("clippy-progress");
const clippySetup = document.getElementById("clippy-model-actions");
const clippyActions = document.getElementById("clippy-chat-actions");
let clippyState = {model: false, job: "", progress: 0, problem: ""};

function setClippyVisible(visible) {
  clippyPanel.hidden = !visible;
  clippyButton.setAttribute("aria-expanded", String(visible));
  if (visible) {
    closeMenu();
    clippyLog.scrollTop = clippyLog.scrollHeight;
    native?.clippyCommand?.("status", "");
  } else if (document.activeElement === clippyInput) {
    clippyInput.blur();
  }
  syncBrowserPosition();
}

function clippyLine(text, fromUser = false) {
  const line = element("p", fromUser ? "clippy-line clippy-user" : "clippy-line", text);
  clippyLog.append(line);
  while (clippyLog.childElementCount > 25) clippyLog.children[1].remove();
  clippyLog.scrollTop = clippyLog.scrollHeight;
}

function clippySearch(query) {
  const text = query.trim();
  if (!text) {
    clippyStatus.textContent = "Enter something to search for.";
    clippyInput.focus();
    return;
  }
  clippyInput.value = "";
  setClippyVisible(false);
  openWindow("browser", "$browser", {address: browserSearchAddress(text)});
}

function activateClippyCommand(command) {
  if (native?.clippyCommand) native.clippyCommand(command, "");
  else clippyStatus.textContent = "Offline chat is available in the Android launcher.";
}

function renderClippyState() {
  const {job, model, progress, problem} = clippyState;
  clippySetup.hidden = model;
  clippyActions.hidden = !model;
  for (const control of [...clippySetup.children, ...clippyActions.children]) control.disabled = Boolean(job);
  clippyProgress.hidden = job !== "downloading";
  clippyProgress.value = progress || 0;
  const statuses = {
    downloading: "Downloading the offline model… " + progress + "%",
    importing: "Importing model…",
    answering: "Clippy is thinking…",
    removing: "Removing model…"
  };
  clippyStatus.textContent = statuses[job] || problem ||
    (model ? "Offline chat ready." : "Set up an offline model for chat.");
  syncBrowserPosition();
}

window.clippyEvent = function (event) {
  clippyState = event;
  if (event.type === "answer") clippyLine(event.error || event.text);
  if (event.type === "mail-answer") finishClippyMail(event);
  renderClippyState();
};

clippyButton.append(retroIcon("clippy", 21));
document.getElementById("clippy-mascot").append(retroIcon("clippy", 51));
document.getElementById("clippy-close").append(windowButton("Hide Clippy", "close", () => setClippyVisible(false)));
clippyButton.addEventListener("click", () => setClippyVisible(clippyPanel.hidden));
document.getElementById("clippy-download").addEventListener("click", () => activateClippyCommand("download"));
document.getElementById("clippy-import").addEventListener("click", () => activateClippyCommand("import"));
document.getElementById("clippy-clear").addEventListener("click", () => {
  clippyLog.querySelectorAll(".clippy-line").forEach(line => line.remove());
  activateClippyCommand("clear");
  clippyInput.focus();
});
document.getElementById("clippy-remove").addEventListener("click", () => {
  dialog({kind: "clippy-remove", title: "Remove Offline Model", icon: "clippy",
    message: "Remove the downloaded model to free up storage?", accept: "Remove", cancel: "Cancel",
    onAccept: () => activateClippyCommand("remove")});
  setClippyVisible(false);
});
document.getElementById("clippy-search").addEventListener("click", () => clippySearch(clippyInput.value));
document.getElementById("clippy-form").addEventListener("submit", event => {
  event.preventDefault();
  const question = clippyInput.value.trim();
  if (!question) return;
  const webSearch = /^(?:please\s+)?(?:search(?:\s+(?:the web|online))?\s+for|look up)\s+(.+)$/i.exec(question);
  if (webSearch) {
    clippySearch(webSearch[1]);
    return;
  }
  if (clippyState.job) return;
  if (!clippyState.model || !native?.clippyCommand) {
    clippyStatus.textContent = "Download or import a model to ask offline questions.";
    return;
  }
  clippyLine(question, true);
  clippyInput.value = "";
  clippyInput.blur();
  clippyState = {...clippyState, job: "answering"};
  renderClippyState();
  native.clippyCommand("ask", question);
});
