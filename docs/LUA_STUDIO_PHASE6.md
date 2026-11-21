# Lua Studio Phase 6 — SQLite applications

**Branch:** testing/lua-studio-2.8-rc. This test build combines Lua Studio Phases 1–5 and a native Android SQLite API. It's a VB6-inspired environment for **Lua**, not the original VB6 compiler or COM/ActiveX.

## Start with the Address Book

Open Lua Studio, choose **Examples → SQLite Address Book**, and Run. Enter a contact and tap Add Contact. The form creates a table, inserts a record using a bound parameter, then displays a query in ListView.

A few functions to try:

```lua
function Form_Load()
  db.exec("CREATE TABLE IF NOT EXISTS contacts (name TEXT NOT NULL)")
end

function AddButton_Click()
  db.exec("INSERT INTO contacts(name) VALUES (?)", ui.get("NameInput", "text"))
end

function Form_DatabaseResult(event)
  if not event.ok then ui.message(event.error); return end
  if event.action == "exec" then
    db.query("SELECT name FROM contacts ORDER BY name LIMIT 24")
  elseif event.action == "query" then
    ui.setColumns("Contacts", event.columns)
    ui.setItems("Contacts", event.text)
  end
end
```

Bind user strings with question marks rather than concatenating SQL. Names like **O'Malley** are handled correctly.

The API is asynchronous: `db.exec(sql, ...values)` and `db.query(sql, ...values)` return IDs; the event `Form_DatabaseResult(event)` includes `id`, `ok`, `action`, `text`, `columns`, `count` and `error`. Query data is tab-separated columns and newline-separated rows, compatible with ListView.

## Isolation and bounds

Each published app has its own private persistent SQLite database (maximum 1 MiB). Every Studio Run has an isolated, disposable in-memory database. Lua never receives unrestricted Android SQLite, filesystem, Java or network access. Only CREATE TABLE / INSERT / UPDATE / DELETE via `db.exec` and SELECT via `db.query` are allowed. SQL length is 2,048 characters maximum; four bound parameters, each at most 512 characters. Result limits: 24 rows, four columns, 14 KiB. No multiple statements, SQL comments, PRAGMA, ATTACH, VACUUM or arbitrary database paths.

## APK installation

**Important:** This build deliberately uses the original Android app ID, so it cannot install as an update over a differently signed v2.7. **Uninstall v2.7 first.** This erases your app-local desktop and Lua projects; the tester approved this for the test build. This release candidate is also signed with a temporary key, and is not yet a stable release.

## Automated checks and physical-device acceptance

GitHub Actions runs Node regression tests across Phases 1–6 and DOSBox, Android Java compilation, APK signature verification, and ZIP/package alignment. On the phone, test the SQLite Address Book (including O'Malley), preview reset, publishing and reopening persistence, code editor touch keyboard, control arrays, forms, dialogs, screen rotation and a known DOSBox game. Source checks cannot certify Android touch and runtime behavior without a physical-device run.
