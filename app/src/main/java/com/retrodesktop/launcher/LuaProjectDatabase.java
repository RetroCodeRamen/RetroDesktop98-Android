package com.retrodesktop.launcher;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Bounded private SQLite databases for published Lua apps and memory-only Studio previews. */
final class LuaProjectDatabase {
    private static final int MAX_ROWS = 24;
    private static final int MAX_COLS = 4;
    private static final int MAX_RESULT = 14000;
    private static final long MAX_DB_BYTES = 1048576;
    private static final String SESSION = "[0-9a-z]{1,12}(?:-[0-9a-z]{1,12}){2}";
    private static final Map<String, SQLiteDatabase> previews = new LinkedHashMap<>();

    static synchronized JSONObject operate(Context context, String session, String program,
                                           String action, String sql, String paramsJson) {
        try {
            if (session == null || !session.matches(SESSION)) return error("Invalid session.");
            boolean published = program != null && LuaProgramStore.valid(program);
            if (!published && program != null && !program.isEmpty()) return error("Invalid app ID.");
            if (!"exec".equals(action) && !"query".equals(action)) return error("Unsupported database command.");
            if (sql == null || sql.isEmpty() || sql.length() > 2048 || sql.indexOf('\u0000') >= 0)
                return error("SQL must contain 1–2048 characters.");
            String statement = sql.trim();
            // One statement only; no direct PRAGMA, ATTACH, VACUUM, extension or path access.
            if (statement.indexOf(';') >= 0 && (statement.indexOf(';') != statement.length() - 1 ||
                statement.substring(0, statement.length() - 1).indexOf(';') >= 0))
                return error("Only one SQL statement is allowed.");
            if (statement.endsWith(";")) statement = statement.substring(0, statement.length() - 1).trim();
            if (statement.contains("--") || statement.contains("/*") || statement.contains("*/"))
                return error("SQL comments are not supported.");
            String upper = statement.toUpperCase(Locale.ROOT);
            if ("query".equals(action) && !upper.matches("(?s)^SELECT\\s+.*"))
                return error("Queries must begin with SELECT.");
            if ("exec".equals(action) && !upper.matches("(?s)^(CREATE\\s+TABLE|INSERT\\s+INTO|UPDATE\\s+|DELETE\\s+FROM)\\s+.*"))
                return error("Only CREATE TABLE, INSERT, UPDATE and DELETE are supported.");
            JSONArray params = paramsJson == null || paramsJson.isEmpty() ? new JSONArray() : new JSONArray(paramsJson);
            if (params.length() > 4) return error("Maximum four SQL parameters.");
            String[] binds = new String[params.length()];
            for (int i = 0; i < binds.length; i++) {
                Object item = params.get(i);
                if (!(item instanceof String) || ((String) item).length() > 512)
                    return error("SQL parameters must be strings no longer than 512 characters.");
                binds[i] = (String) item;
            }
            SQLiteDatabase db;
            if (published) {
                File path = context.getDatabasePath("lua-" + program + ".db");
                File dir = path.getParentFile();
                if (dir == null || (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()))
                    return error("Database directory unavailable.");
                db = SQLiteDatabase.openOrCreateDatabase(path, null);
            } else {
                db = previews.get(session);
                if (db == null || !db.isOpen()) {
                    if (previews.size() >= DesktopLuaStudio.MAX_SESSIONS)
                        return error("Too many preview databases.");
                    db = SQLiteDatabase.create(null);
                    previews.put(session, db);
                }
            }
            try {
                db.setMaximumSize(MAX_DB_BYTES);
                if ("exec".equals(action)) {
                    if (binds.length == 0) db.execSQL(statement);
                    else db.execSQL(statement, binds);
                    return new JSONObject().put("ok", true).put("text", "");
                }
                try (Cursor rows = db.rawQuery(statement, binds)) {
                    if (rows.getColumnCount() > MAX_COLS) return error("Query returns too many columns (max 4).");
                    StringBuilder headings = new StringBuilder();
                    for (int c = 0; c < rows.getColumnCount(); c++) {
                        String heading = rows.getColumnName(c).replace('\t', ' ').replace('\n', ' ');
                        if (heading.length() > 24) return error("Column name exceeds 24 characters.");
                        if (c > 0) headings.append('\t');
                        headings.append(heading);
                    }
                    StringBuilder contents = new StringBuilder();
                    int count = 0;
                    while (rows.moveToNext()) {
                        if (++count > MAX_ROWS) return error("Query returns too many rows (max 24).");
                        if (count > 1) contents.append('\n');
                        for (int c = 0; c < rows.getColumnCount(); c++) {
                            if (c > 0) contents.append('\t');
                            String value = rows.isNull(c) ? "" : rows.getString(c);
                            if (value != null && value.length() > 512)
                                return error("Query field exceeds 512 characters.");
                            contents.append(value == null ? "" :
                                    value.replace('\t', ' ').replace('\n', ' ').replace('\r', ' '));
                        }
                        if (contents.length() > MAX_RESULT) return error("Query result exceeds 14 KiB.");
                    }
                    return new JSONObject().put("ok", true).put("text", contents.toString())
                            .put("columns", headings.toString()).put("count", count);
                }
            } finally {
                if (published) db.close();
            }
        } catch (SQLiteException | JSONException | IllegalArgumentException e) {
            return error("Database error: " + LuaStudioRuntime.shorten(e.getMessage(), 160));
        }
    }

    static synchronized void closeSession(String session) {
        if (session == null || !session.matches(SESSION)) return;
        SQLiteDatabase db = previews.remove(session);
        if (db != null && db.isOpen()) db.close();
    }

    private static JSONObject error(String message) {
        JSONObject result = new JSONObject();
        try { result.put("ok", false).put("error", LuaStudioRuntime.shorten(message, 190)); }
        catch (JSONException e) { throw new IllegalStateException(e); }
        return result;
    }
}
