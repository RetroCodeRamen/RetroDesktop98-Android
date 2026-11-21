"use strict";

let nextMailWindow = 0;
let pendingMailAssistant = null;

function renderMailApp(win) {
  win.cleanup = () => { if (pendingMailAssistant?.win === win) pendingMailAssistant = null; };
  win.mail = {
    windowId: ++nextMailWindow, request: 0, pending: "", account: null, messages: [],
    message: null, view: "inbox", status: "", draft: null
  };
  win.beforeClose = () => {
    if (win.mail.pending === "send") {
      announce("Wait for the outgoing server to respond.");
      return false;
    }
    if (win.mail.view !== "compose" || !hasDraft(win.mail)) return true;
    confirmDiscardMail(() => {
      win.mail.draft = null;
      closeWindow(win.id);
    });
    return false;
  };
  requestMail(win, "status");
}

function requestMail(win, action, data = "") {
  const mail = win.mail;
  if (mail.pending) return;
  if (!native?.mailCommand) {
    mail.status = "Email is available in the Android launcher.";
    mail.view = "account";
    paintMail(win);
    return;
  }
  const statuses = {
    status: "Checking account…", save: "Saving account…", list: "Getting mail…",
    read: "Opening message…", attach: "Getting attachment…", send: "Sending…", remove: "Removing account…"
  };
  mail.pending = action;
  mail.status = statuses[action];
  const token = mail.windowId + ":" + (++mail.request);
  paintMail(win);
  native.mailCommand(action, token, typeof data === "string" ? data : JSON.stringify(data));
}

window.mailEvent = function (event) {
  const win = openWindows.get("$mail");
  if (!win?.mail) return;
  const mail = win.mail;
  if (event.request !== mail.windowId + ":" + mail.request || event.action !== mail.pending) return;
  mail.pending = "";
  if (event.error) {
    mail.status = event.error;
    if (event.action === "status") mail.view = "account";
    paintMail(win);
    return;
  }
  switch (event.action) {
    case "status":
    case "save":
      mail.account = event.account;
      mail.messages = [];
      mail.message = null;
      mail.view = mail.account ? "inbox" : "account";
      if (mail.account) {
        requestMail(win, "list");
        return;
      }
      mail.status = "Add an account to get mail.";
      break;
    case "remove":
      mail.account = null;
      mail.messages = [];
      mail.message = null;
      mail.draft = null;
      mail.view = "account";
      mail.status = "Account removed from this launcher.";
      break;
    case "list":
      mail.messages = event.messages;
      if (mail.message && !mail.messages.some(item => item.id === mail.message.id)) mail.message = null;
      mail.status = mail.messages.length + (mail.messages.length === 1 ? " message" : " messages");
      break;
    case "read":
      mail.message = event.message;
      mail.status = "Message opened.";
      break;
    case "attach":
      mail.status = "Attachment retrieved.";
      break;
    case "send":
      mail.draft = null;
      mail.view = "inbox";
      mail.status = "Message accepted by the outgoing server.";
      break;
  }
  paintMail(win);
};

function paintMail(win) {
  const mail = win.mail;
  const bar = element("div", "app-toolbar mail-toolbar");
  const newMail = toolbarButton("New Mail", () => composeMail(win));
  const reply = toolbarButton("Reply", () => composeMail(win, mail.message));
  const getMail = toolbarButton("Get Mail", () => {
    mail.view = "inbox";
    requestMail(win, "list");
  });
  const account = toolbarButton("Account", () => {
    mail.view = "account";
    paintMail(win);
  });
  newMail.disabled = !!mail.pending || !mail.account || mail.view === "compose";
  reply.disabled = newMail.disabled || !mail.message?.replyTo;
  getMail.disabled = !!mail.pending || !mail.account || mail.view === "compose";
  account.disabled = !!mail.pending || mail.view === "compose";
  bar.append(newMail, reply, getMail, account);
  if (mail.view === "inbox" && mail.message) {
    const ask = toolbarButton("Ask Clippy…", () => {
      const bounds = ask.getBoundingClientRect();
      showMenu([
        ["Summarize", "clippy", () => askClippyAboutMail(win, "summary")],
        ["Draft a reply", "clippy", () => askClippyAboutMail(win, "draft"), !mail.message?.replyTo]
      ], bounds.left, bounds.bottom, ask);
    });
    ask.dataset.clippyMail = "";
    ask.setAttribute("aria-haspopup", "true");
    ask.setAttribute("aria-expanded", "false");
    ask.disabled = !!mail.pending || !mail.message.body.trim() || !!pendingMailAssistant;
    bar.append(ask);
  }
  let content;
  if (mail.view === "account") content = mailAccountForm(win);
  else if (mail.view === "compose") content = mailComposeForm(win);
  else content = mailInbox(win);
  win.body.replaceChildren(bar, content, appStatus(mail.status || "Ready"));
}

function mailField(label, name, value = "", type = "text") {
  const field = element("label", "mail-field");
  field.append(element("span", "", label));
  const input = element("input", "text-entry");
  input.type = type;
  input.name = name;
  input.value = value;
  input.autocomplete = "off";
  input.spellcheck = false;
  field.append(input);
  return field;
}

function mailAccountForm(win) {
  const mail = win.mail;
  const saved = mail.account || {};
  const form = element("form", "mail-form");
  const panel = element("div", "mail-account-fields");
  const fields = [
    ["Email address", "address", saved.address, "email"],
    ["Username (defaults to email)", "username", saved.username],
    ["Password or app password", "password", "", "password"],
    ["IMAP server", "imapHost", saved.imapHost],
    ["IMAP port", "imapPort", saved.imapPort || 993, "number"],
    ["SMTP server", "smtpHost", saved.smtpHost],
    ["SMTP port", "smtpPort", saved.smtpPort || 465, "number"]
  ];
  for (const [label, name, value, type] of fields) {
    panel.append(mailField(label, name, value ?? "", type || "text"));
  }
  const transport = element("label", "mail-field");
  transport.append(element("span", "", "SMTP encryption"));
  const encryption = element("select", "text-entry");
  encryption.name = "encryption";
  encryption.append(new Option("TLS (465)", "tls"), new Option("STARTTLS (587)", "starttls"));
  encryption.value = saved.startTls ? "starttls" : "tls";
  encryption.addEventListener("change", () => {
    const port = form.elements.smtpPort;
    if (port.value === "465" || port.value === "587") port.value = encryption.value === "tls" ? 465 : 587;
  });
  transport.append(encryption);
  panel.append(transport);
  form.append(panel);
  const actions = element("div", "app-toolbar");
  const save = toolbarButton("Save Account", () => {});
  save.type = "submit";
  const gmail = toolbarButton("Gmail Settings", () => {
    form.elements.imapHost.value = "imap.gmail.com";
    form.elements.imapPort.value = 993;
    form.elements.smtpHost.value = "smtp.gmail.com";
    form.elements.smtpPort.value = 465;
    form.elements.encryption.value = "tls";
    mail.status = "For Gmail, enter an app password if your account allows one.";
    win.body.querySelector("[role='status']").textContent = mail.status;
  });
  actions.append(save, gmail);
  if (mail.account) {
    actions.append(toolbarButton("Cancel", () => { mail.view = "inbox"; paintMail(win); }));
    actions.append(toolbarButton("Remove Account…", () => {
      dialog({kind: "mail-remove", title: "Remove Mail Account", icon: "mail",
        message: "Remove the saved sign-in from Outlook Express? Your messages stay on the mail server.",
        accept: "Remove", cancel: "Cancel", onAccept: () => requestMail(win, "remove")});
    }));
  }
  form.append(actions);
  for (const field of form.elements) {
    field.disabled = !!mail.pending;
    if (field.tagName === "INPUT") field.required = field.name !== "username";
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    requestMail(win, "save", {
      address: data.address, username: data.username, password: data.password,
      imapHost: data.imapHost, imapPort: Number(data.imapPort), smtpHost: data.smtpHost,
      smtpPort: Number(data.smtpPort), startTls: data.encryption === "starttls"
    });
  });
  return form;
}

function mailInbox(win) {
  const {mail} = win;
  const inbox = element("div", "mail-inbox");
  const list = element("div", "explorer mail-list");
  list.setAttribute("aria-label", "Inbox messages");
  if (!mail.messages.length) {
    list.append(element("p", "empty-note", mail.pending ? mail.status :
      mail.status === "0 messages" ? "Inbox is empty." : "Select Get Mail to open your inbox."));
  }
  for (const item of mail.messages) {
    const row = button("", () => requestMail(win, "read", item.id), "mail-row");
    row.disabled = !!mail.pending;
    row.setAttribute("aria-pressed", String(item.id === mail.message?.id));
    row.append(element("span", "mail-subject", item.subject || "(No subject)"),
      element("span", "mail-row-meta", item.from + (item.date ? " · " + mailDate(item.date) : "")));
    list.append(row);
  }
  const reader = element("div", "explorer mail-reader");
  const message = mail.message;
  if (message) {
    reader.append(element("h3", "", message.subject || "(No subject)"),
      element("p", "mail-from", message.from + (message.date ? " · " + new Date(message.date).toLocaleString() : "")));
    if (message.attachments?.length) {
      const links = element("div", "mail-attachments");
      for (const file of message.attachments) {
        const group = element("div", "app-toolbar");
        const open = toolbarButton(file.name, () => requestMail(win, "attach", {
          id: message.id, path: file.path
        }));
        open.classList.add("mail-attachment");
        open.title = "Open " + file.name;
        const save = toolbarButton("Save…", () => requestMail(win, "attach", {
          id: message.id, path: file.path, save: true
        }));
        save.setAttribute("aria-label", "Save " + file.name);
        open.disabled = save.disabled = !!mail.pending;
        group.append(open, save);
        links.append(group);
      }
      reader.append(links);
    }
    if (mail.summary?.message === message.id) {
      const summary = element("div", "clippy-mail-summary");
      summary.append(element("strong", "", mail.summary.partial ? "Clippy summary of the opening text" : "Clippy summary"),
        element("p", "mail-text", mail.summary.text));
      reader.append(summary);
    }
    reader.append(element("pre", "mail-text", message.body || "This message has no text preview."));
  } else {
    reader.append(element("p", "empty-note", "Select a message to read it."));
  }
  inbox.append(list, reader);
  return inbox;
}

function mailDate(value) {
  return new Date(value).toLocaleDateString(undefined, {month: "short", day: "numeric"});
}

function composeMail(win, original = null, generated = "") {
  const mail = win.mail;
  const subject = original?.subject || "";
  mail.draft = original ? {
    to: original.replyTo, subject: /^re:/i.test(subject) ? subject : "Re: " + subject,
    body: generated, inReplyTo: original.messageId
  } : {to: "", subject: "", body: "", inReplyTo: ""};
  mail.view = "compose";
  mail.status = generated ? "Review Clippy’s draft before sending." : "New message from " + mail.account.address;
  paintMail(win);
  (original ? win.body.querySelector("textarea") : win.body.querySelector("[name='to']")).focus();
}

function hasDraft(mail) {
  return mail.draft && (mail.draft.body || mail.draft.subject || mail.draft.to);
}

function confirmDiscardMail(discard) {
  dialog({kind: "mail-discard", title: "Discard Draft", icon: "mail", message: "Discard this draft?",
    accept: "Discard", cancel: "Keep Editing", onAccept: discard});
}

function mailComposeForm(win) {
  const {mail} = win;
  const form = element("form", "mail-form mail-compose");
  const to = mailField("To", "to", mail.draft.to);
  const subject = mailField("Subject", "subject", mail.draft.subject);
  subject.querySelector("input").maxLength = 300;
  to.querySelector("input").maxLength = 2048;
  to.querySelector("input").required = true;
  const text = element("textarea", "text-entry");
  text.name = "body";
  text.setAttribute("aria-label", "Message");
  text.value = mail.draft.body;
  text.maxLength = 40000;
  const actions = element("div", "app-toolbar");
  const send = toolbarButton("Send", () => {});
  send.type = "submit";
  actions.append(send, toolbarButton("Cancel", () => {
    const discard = () => {
      mail.draft = null;
      mail.view = "inbox";
      mail.status = "Draft discarded.";
      paintMail(win);
    };
    if (hasDraft(mail)) confirmDiscardMail(discard);
    else discard();
  }));
  form.append(to, subject, text, actions);
  form.addEventListener("input", event => {
    mail.draft[event.target.name] = event.target.value;
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    requestMail(win, "send", mail.draft);
  });
  for (const field of form.elements) field.disabled = !!mail.pending;
  return form;
}


function askClippyAboutMail(win, action) {
  const {mail} = win;
  const message = mail.message;
  if (!message || mail.pending || pendingMailAssistant) return;
  if (clippyState.job) { announce("Clippy is busy. Try again in a moment."); return; }
  if (!clippyState.model || !native?.clippyMail) {
    setClippyVisible(true);
    announce("Install Clippy’s offline model to use it with mail.");
    return;
  }
  const request = Array.from(crypto.getRandomValues(new Uint32Array(3)), value => value.toString(36)).join("-");
  const partial = message.body.length > 1600;
  const source = message.body.slice(0, 1600).replace(/[\ud800-\udbff]$/, "");
  pendingMailAssistant = {request, win, message, action, partial};
  mail.status = "Clippy is working locally…";
  paintMail(win);
  native.clippyMail(request, action, message.subject, source);
}

function finishClippyMail(event) {
  if (!pendingMailAssistant || event.request !== pendingMailAssistant.request) return;
  const {win, message, action, partial} = pendingMailAssistant;
  pendingMailAssistant = null;
  if (win !== openWindows.get("$mail")) return;
  const mail = win.mail;
  if (event.error || !event.text) {
    mail.status = event.error || "Clippy couldn’t help with this message.";
  } else if (mail.view !== "inbox" || mail.message?.id !== message.id || mail.pending) {
    announce("Select the original message to try Clippy again.");
    const ask = win.body.querySelector("[data-clippy-mail]");
    if (ask && !mail.pending) ask.disabled = !mail.message?.body?.trim();
    return;
  } else if (action === "draft") {
    composeMail(win, message, event.text);
    if (partial) {
      mail.status = "Clippy used the opening text. Review the draft before sending.";
      paintMail(win);
    }
    return;
  } else {
    mail.summary = {message: message.id, text: event.text, partial};
    mail.status = "Clippy summarized the message.";
  }
  paintMail(win);
}
