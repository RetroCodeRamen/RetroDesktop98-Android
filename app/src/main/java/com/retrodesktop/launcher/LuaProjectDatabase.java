package com.retrodesktop.launcher;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** A separate, bounded SQLite database for each published Lua program.
 * Preview databases are in-memory and live only while that preview is running.
 * SQL never executes in the isolated Lua process or against the launcher's DB.
 */
final class LuaProjectDatabase {
    private static final int MAX_SQL = 2048;
    private static final int MAX_RESULT = 14000;
    private static final int MAX_ROWS = 24;
    private static final int MAX_COLS = 4;
    private static final long MAX_DB_BYTES = 1_048_576;
    private static final Map<String, SQLiteDatabase> previews = new LinkedHashMap<>();
    private static final String SESSION = "[0-9a-z]{1,12}(?:-[0-9a-z]{1,12}){2}";

    static synchronized JSONObject operate(Context context, String session, String program, String action, String sql, String paramsJson) {
        try {
            if (session == null || !session.matches(SESSION)) return error("Invalid session.");
            boolean published = program != null && LuaProgramStore.valid(program);
            if (!published && program != null && !program.isEmpty()) return error("Invalid app ID.");
            if (!"exec".equals(action) && !"query".equals(action)) return error("Unsupported database command.");
            if (sql == null || sql.length() == 0 || sql.length() > MAX_SQL || sql.indexOf('\u0000') >= 0)
                return error("SQL must contain 1–2048 characters.");
            String normalized = sql.trim();
            // One statement, no ATTACH/PRAGMA/VACUUM/extension or schema alteration.
            // Semicolons in string literals are not supported by this deliberately small API.
            if (normalized.indexOf(';') >= 0 &&
                    (normalized.indexOf(';') != normalized.length() - 1 ||
                     normalized.substring(0, normalized.length() - 1).indexOf(';') >= 0))
                return error("Only one SQL statement is allowed.");
            if (normalized.endsWith(";")) normalized = normalized.substring(0, normalized.length() - 1).trim();
            if (normalized.contains("--") || normalized.contains("/*") || normalized.contains("*/"))
                return error("SQL comments are not supported.");
            // Prevent unbounded joins, recursive SQL and administrative commands
            // from consuming the launcher thread or escaping the per-app scope.
            if (normalized.matches("(?is).*\\b(JOIN|UNION|INTERSECT|EXCEPT|RECURSIVE|ATTACH|DETACH|PRAGMA|VACUUM)\\b.*"))
                return error("Complex or administrative SQL is not supported.");
            String upper = normalized.toUpperCase(Locale.ROOT);
            if ("query".equals(action) && !upper.matches("(?s)^SELECT\\s+.*"))
                return error("Queries must start with SELECT.");
            if ("exec".equals(action) && !upper.matches("(?s)^(CREATE\\s+TABLE\\s+.*|INSERT\\s+INTO\\s+.*|UPDATE\\s+.*|DELETE\\s+FROM\\s+.*)"))
                return error("Only CREATE TABLE, INSERT, UPDATE and DELETE are allowed.");
            JSONArray params = paramsJson == null || paramsJson.isEmpty() ? new JSONArray() : new JSONArray(paramsJson);
            if (params.length() > 4) return error("Maximum four SQL parameters.");
            String[] binds = new String[params.length()];
            for (int i = 0; i < binds.length; i++) {
                Object raw = params.get(i);
                if (!(raw instanceof String) || ((String) raw).length() > 512)
                    return error("SQL parameters must be strings of at most 512 characters.");
                binds[i] = (String) raw;
            }
            SQLiteDatabase database;
            boolean closeAfter = published;
            if (published) {
                File path = context.getDatabasePath("lua-" + program + ".db");
                File dir = path.getParentFile();
                if (dir == null || (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()))
                    return error("Database directory is unavailable.");
                database = SQLiteDatabase.openOrCreateDatabase(path, null);
            } else {
                database = previews.get(session);
                if (database == null || !database.isOpen()) {
                    if (previews.size() >= DesktopLuaStudio.MAX_SESSIONS) return error("Too many preview databases.");
                    database = SQLiteDatabase.create(null);
                    previews.put(session, database);
                }
            }
            try {
                database.setMaximumSize(MAX_DB_BYTES);
                if ("exec".equals(action)) {
                    // SQLITE_FULL is propagated as an error rather than silently overflowing a limit.
                    if (binds.length == 0) database.execSQL(normalized);
                    else database.execSQL(normalized, binds);
                    return new JSONObject().put("ok", true).put("text", "");
                }
                try (Cursor rows = database.rawQuery(normalized, binds)) {
                    if (rows.getColumnCount() > MAX_COLS) return error("Query returns too many columns (max 4).");
                    StringBuilder headings = new StringBuilder();
                    for (int col = 0; col < rows.getColumnCount(); col++) {
                        String name = rows.getColumnName(col).replace('\t', ' ').replace('\n', ' ');
                        if (name.length() > 24) return error("Column name exceeds 24 characters.");
                        if (col > 0) headings.append('\t');
                        headings.append(name);
                    }
                    StringBuilder result = new StringBuilder();
                    int count = 0;
                    while (rows.moveToNext()) {
                        if (++count > MAX_ROWS) return error("Query returns too many rows (max 24).");
                        if (count > 1) result.append('\n');
                        for (int col = 0; col < rows.getColumnCount(); col++) {
                            if (col > 0) result.append('\t');
                            String value = rows.isNull(col) ? "" : rows.getString(col);
                            if (value != null && value.length() > 512) return error("Query field exceeds 512 characters.");
                            result.append(value == null ? "" : value.replace('\t', ' ').replace('\r', ' ').replace('\n', ' '));
                        }
                        if (result.length() > MAX_RESULT) return error("Query result exceeds 14 KiB.");
                    }
                    return new JSONObject().put("ok", true).put("text", result.toString())
                            .put("columns", headings.toString()).put("count", count);
                }
            } finally {
                if (closeAfter) database.close();
            }
        } catch (SQLiteException | JSONException | IllegalArgumentException ex) {
            return error("Database error: " + LuaStudioRuntime.shorten(ex.getMessage(), 160));
        }
    }

    static synchronized void closeSession(String session) {
        if (session == null || !session.matches(SESSION)) return;
        SQLiteDatabase db = previews.remove(session);
        if (db != null && db.isOpen()) db.close();
    }

    private static JSONObject error(String text) {
        JSONObject result = new JSONObject();
        try { result.put("ok", false).put("error", LuaStudioRuntime.shorten(text, 190)); }
        catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return result;
    }
}
