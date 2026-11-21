# Lua Studio Phase 6: SQLite development build

**Experimental**: VB6-inspired Lua Studio with a real SQLite database for each published Lua app. Studio previews use an in-memory database and do not change published data.

`db.exec(sql, ...args)` supports one CREATE TABLE / INSERT / UPDATE / DELETE. `db.query(sql, ...args)` supports SELECT. Use `?` placeholders rather than concatenating user input. Each call is asynchronous; receive `Form_DatabaseResult(event)` with `id, action, ok, text, columns, count, error`. Query text contains newline-separated rows and tab-separated columns for ListView.

**Limits**: four bound parameters (512 chars each), four calls per event, SQL ≤2048 chars, 24 returned rows, four columns, ≤14KiB returned text, database ≤1MiB. No network, ATTACH, PRAGMA, recursive queries or cross-app data. Published data normally disappears when the launcher is uninstalled. Not full VB6, COM, ActiveX, or an EXE compiler.

Try Examples → SQLite Address Book, then publish it and verify that records survive closing/reopening. Use `node tests/lua-studio-phase6.test.js` for the bridge regression check. Device testing is still needed.
