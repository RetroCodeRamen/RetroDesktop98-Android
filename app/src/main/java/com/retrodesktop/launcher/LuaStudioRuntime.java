package com.retrodesktop.launcher;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.luaj.vm2.Globals;
import org.luaj.vm2.LuaError;
import org.luaj.vm2.LuaString;
import org.luaj.vm2.LuaTable;
import org.luaj.vm2.LuaValue;
import org.luaj.vm2.Varargs;
import org.luaj.vm2.compiler.LuaC;
import org.luaj.vm2.lib.BaseLib;
import org.luaj.vm2.lib.MathLib;
import org.luaj.vm2.lib.StringLib;
import org.luaj.vm2.lib.VarArgFunction;
import org.luaj.vm2.lib.OneArgFunction;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

final class LuaStudioRuntime {
    static final int MAX_PAYLOAD = 220_000;
    static final int MAX_SCRIPT = 60_000;
    private static final int MAX_CONTROLS = 48;
    private static final int MAX_TEXT = 500;
    private static final int MAX_LOG_LINES = 30;
    private final Map<String, Form> forms = new LinkedHashMap<>();
    private final Map<String, String> modules = new LinkedHashMap<>();
    private final LuaStudioDebugger debugger;
    private final Form startup;
    private final boolean legacy;
    private Globals moduleEnv;
    private Form current;
    private JSONArray output;
    private JSONObject patches;
    private JSONArray presentation;
    private JSONArray dialogs;
    private JSONArray fileRequests;
    private JSONArray databaseRequests;
    private int databaseSequence;
    private int fileSequence;
    private int dialogSequence;
    private final Map<String, String> storage = new LinkedHashMap<>();
    private boolean storageDirty;
    private final ArrayDeque<Navigation> requests = new ArrayDeque<>();
    private final ArrayDeque<Form> modalStack = new ArrayDeque<>();
    private String message;
    private int patchCount;

    LuaStudioRuntime(JSONObject project) throws JSONException {
        this(project, new LuaStudioDebugger(new JSONObject(), null));
    }

    LuaStudioRuntime(JSONObject project, LuaStudioDebugger debugger) throws JSONException {
        this.debugger = debugger;
        JSONObject prior = project.optJSONObject("_store");
        if (prior != null) {
            java.util.Iterator<String> keys = prior.keys();
            while (keys.hasNext() && storage.size() < 32) {
                String key = keys.next();
                Object stored = prior.opt(key);
                if (key.matches("[A-Za-z][A-Za-z0-9_-]{0,31}") && stored instanceof String &&
                    ((String) stored).length() <= 256) storage.put(key, (String) stored);
            }
        }
        JSONArray definitions = project.optJSONArray("forms");
        legacy = definitions == null;
        if (legacy) {
            startup = new Form("Main", project);
            forms.put(startup.name, startup);
            return;
        }
        if (definitions.length() < 1 || definitions.length() > 8) throw new IllegalArgumentException("Invalid form count.");
        for (int index = 0; index < definitions.length(); index++) {
            JSONObject entry = definitions.getJSONObject(index);
            String name = identifier(entry.getString("name"));
            if (forms.put(name, new Form(name, entry)) != null) throw new IllegalArgumentException("Duplicate form name.");
        }
        startup = forms.get(project.optString("startup"));
        if (startup == null) throw new IllegalArgumentException("Choose a startup form.");
        JSONArray files = project.getJSONArray("modules");
        if (files.length() > 12) throw new IllegalArgumentException("Too many modules.");
        for (int index = 0; index < files.length(); index++) {
            JSONObject entry = files.getJSONObject(index);
            String name = identifier(entry.getString("name"));
            if (forms.containsKey(name) || modules.put(name, source(entry.getString("code"))) != null) {
                throw new IllegalArgumentException("Duplicate module name.");
            }
        }
    }

    JSONObject startProject() throws JSONException {
        return start(startup.definition.optString("code"));
    }

    JSONObject start(String initialSource) throws JSONException {
        begin();
        modalStack.clear();
        try {
            current = startup;
            moduleEnv = setup(null);
            for (Map.Entry<String, String> entry : modules.entrySet()) {
                moduleEnv.load(entry.getValue(), "@" + entry.getKey() + ".lua").call();
            }
            load(startup, source(initialSource));
            startup.open = true;
            presentation.put(change("show", startup.name));
            invoke("Form_Activate", LuaValue.NIL);
            navigate();
            return result("", false);
        } catch (LuaError error) {
            return result(error.getMessage(), true);
        } catch (LuaStudioDebugger.Limit limit) {
            return result(limit.getMessage(), true);
        }
    }

    JSONObject event(JSONObject input) throws JSONException {
        begin();
        try {
            Form receiver = forms.get(input.optString("form", startup.name));
            if (receiver == null || !receiver.open ||
                    (!modalStack.isEmpty() && modalStack.peekLast() != receiver)) return result("", false);
            current = receiver;
            JSONObject updates = input.optJSONObject("updates");
            if (updates != null) applyInputs(updates);
            String name = input.optString("name");
            String action = input.getString("event");
            Control control = receiver.controls.get(name);
            if ("CloseForm".equals(action)) {
                requests.add(new Navigation("unload", receiver));
            } else if ("Menu".equals(action) && receiver.menuItems.contains(name)) {
                invoke(name + "_Click", LuaValue.NIL);
            } else if (name.isEmpty() && isFormEvent(action)) {
                invoke("Form_" + action, eventDetails(input));
            } else if (control != null && control.get("enabled").toboolean() && control.fires(action)) {
                LuaValue value = "Change".equals(action) && control.inputProperty() != null
                        ? control.get(control.inputProperty()) : eventDetails(input);
                if (!control.arrayName.isEmpty()) invokeArray(control.arrayName + "_" + action, control.arrayIndex, value);
                else invoke(name + "_" + action, value);
            }
            navigate();
            return result("", false);
        } catch (LuaError error) {
            return result(error.getMessage(), false);
        } catch (LuaStudioDebugger.Limit limit) {
            return result(limit.getMessage(), true);
        }
    }

    // Event arguments are explicit, bounded scalar fields—not arbitrary JSON converted
    // into Lua objects. The engine remains sandboxed from Android and Java reflection.
    private static LuaValue eventDetails(JSONObject input) {
        JSONObject raw = input.optJSONObject("args");
        if (raw == null) return LuaValue.NIL;
        LuaTable values = new LuaTable();
        for (String key : new String[]{"x", "y", "button", "id", "count"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(Math.max("id".equals(key) ? 0 : -4096, Math.min("id".equals(key) ? 1000000 : 4096, raw.optInt(key)))));
        }
        for (String key : new String[]{"shift", "ctrl", "alt", "accepted", "ok"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(raw.optBoolean(key)));
        }
        for (String key : new String[]{"key", "code", "kind", "value", "name", "action", "error", "text", "columns"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(shorten(raw.optString(key), "text".equals(key) ? 16384 : "error".equals(key) ? 180 : "columns".equals(key) ? 110 : "value".equals(key) ? 100 : 40)));
        }
        return values;
    }

    private static boolean isFormEvent(String action) {
        return "Click".equals(action) || "DblClick".equals(action) || "MouseDown".equals(action)
                || "MouseUp".equals(action) || "KeyDown".equals(action) || "KeyUp".equals(action)
                || "DialogResult".equals(action) || "FileResult".equals(action) || "DatabaseResult".equals(action);
    }

    private void applyInputs(JSONObject updates) throws JSONException {
        for (java.util.Iterator<String> keys = updates.keys(); keys.hasNext();) {
            String name = keys.next();
            Control control = current.controls.get(name);
            if (control == null) continue;
            String property = control.inputProperty();
            if (property == null || !control.get("enabled").toboolean()) continue;
            control.set(property, scalar(updates.get(name)));
            if (control.type.equals("option") && control.get("checked").toboolean()) uncheckPeers(current, control);
        }
    }

    private void load(Form form, String code) throws JSONException {
        current = form;
        form.scope = setup(moduleEnv);
        try {
            form.scope.load(code, "@" + form.name + ".lua").call();
            invoke("Form_Load", LuaValue.NIL);
        } catch (LuaError error) {
            form.scope = null;
            form.reset();
            patches.remove(form.name);
            throw error;
        }
    }

    private void navigate() throws JSONException {
        int processed = 0;
        while (!requests.isEmpty()) {
            if (++processed > 20) throw new LuaStudioDebugger.Limit("Lua issued too many form commands in one event.");
            Navigation operation = requests.remove();
            Form target = operation.form;
            current = target;
            switch (operation.action) {
                case "modal":
                case "show":
                    if (target.scope == null) load(target, source(target.definition.getString("code")));
                    target.open = true;
                    if ("modal".equals(operation.action)) {
                        modalStack.remove(target);
                        modalStack.addLast(target);
                    }
                    presentation.put(change(operation.action, target.name));
                    invoke("Form_Activate", LuaValue.NIL);
                    break;
                case "hide":
                    target.open = false;
                    modalStack.remove(target);
                    presentation.put(change("hide", target.name));
                    break;
                case "unload":
                    try {
                        if (target.scope != null) invoke("Form_Unload", LuaValue.NIL);
                    } finally {
                        target.open = false;
                        modalStack.remove(target);
                        target.scope = null;
                        target.reset();
                        patches.remove(target.name);
                        presentation.put(change("unload", target.name));
                    }
                    break;
            }
        }
    }

    private static JSONObject change(String action, String name) throws JSONException {
        return new JSONObject().put("form", name).put("action", action);
    }

    private Globals setup(Globals shared) {
        Globals env = new Globals();
        env.load(new BaseLib());
        for (String name : new String[]{"collectgarbage", "load", "loadfile", "dofile", "getmetatable",
                "setmetatable", "pcall", "xpcall"}) env.set(name, LuaValue.NIL);
        LuaTable packages = new LuaTable();
        packages.set("loaded", new LuaTable());
        env.set("package", packages);
        env.load(new MathLib());
        LuaTable strings = (LuaTable) env.load(new StringLib());
        for (String name : new String[]{"byte", "dump", "find", "format", "gmatch", "gsub", "match", "rep"}) {
            strings.set(name, LuaValue.NIL);
        }
        LuaTable primitiveMethods = new LuaTable();
        for (String name : new String[]{"char", "len", "lower", "reverse", "sub", "upper"}) {
            primitiveMethods.set(name, strings.get(name));
        }
        LuaTable stringMethods = new LuaTable();
        stringMethods.set("__index", primitiveMethods);
        LuaString.s_metatable = stringMethods;
        env.load(debugger.hook(env));
        env.set("debug", LuaValue.NIL);
        env.set("package", LuaValue.NIL);
        LuaC.install(env);
        if (shared != null) {
            LuaTable parent = new LuaTable();
            parent.set("__index", shared);
            env.setmetatable(parent);
        } else env.set("shared", new LuaTable());

        LuaTable ui = new LuaTable();
        ui.set("get", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(3));
                Control control = form.control(args.checkjstring(1));
                return control.get(args.optjstring(2, control.defaultProperty()));
            }
        });
        ui.set("getAt", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(4));
                Control control = form.arrayControl(args.checkjstring(1), args.checkint(2));
                return control.get(args.optjstring(3, control.defaultProperty()));
            }
        });
        ui.set("setAt", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(5));
                String array = args.checkjstring(1);
                int index = args.checkint(2);
                Control control = form.arrayControl(array, index);
                String property = args.checkjstring(3);
                control.set(property, args.arg(4));
                String physicalName = form.arrayPhysicalName(array, index);
                patch(form, physicalName, property, control.get(property));
                if ("option".equals(control.type) && "checked".equals(property) && control.get("checked").toboolean()) {
                    uncheckPeers(form, control);
                }
                return LuaValue.NONE;
            }
        });
        ui.set("getItems", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                return LuaValue.valueOf(lookup(args.arg(2)).control(args.checkjstring(1)).itemText());
            }
        });
        ui.set("getColumns", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Control control = lookup(args.arg(2)).control(args.checkjstring(1));
                if (!"listview".equals(control.type)) throw new LuaError("Only ListView supports columns.");
                return LuaValue.valueOf(String.join("\t", control.columns));
            }
        });
        ui.set("setColumns", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(3));
                String name = args.checkjstring(1);
                Control control = form.control(name);
                control.setColumns(args.checkjstring(2));
                patchColumns(form, name, control);
                return LuaValue.NONE;
            }
        });
        ui.set("setItems", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(3));
                String name = args.checkjstring(1);
                Control control = form.control(name);
                String options = args.checkjstring(2);
                control.setItems(options);
                patchItems(form, name, control);
                patch(form, name, "value", control.get("value"));
                return LuaValue.NONE;
            }
        });
        ui.set("set", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                Form form = lookup(args.arg(4));
                String name = args.checkjstring(1);
                Control control = form.control(name);
                String key = args.narg() == 2 ? control.defaultProperty() : args.checkjstring(2);
                control.set(key, args.narg() == 2 ? args.arg(2) : args.arg(3));
                patch(form, name, key, control.get(key));
                if ("option".equals(control.type) && "checked".equals(key) && control.get("checked").toboolean()) {
                    uncheckPeers(form, control);
                }
                return LuaValue.NIL;
            }
        });
        // showModal is asynchronous: it disables other Lua form windows, but does
        // not synchronously block the isolated Lua event handler like VB6 vbModal.
        for (String action : new String[]{"show", "showModal", "hide", "unload"}) {
            ui.set(action, new OneArgFunction() {
                @Override public LuaValue call(LuaValue supplied) {
                    if (requests.size() >= 20) throw new LuaStudioDebugger.Limit("Lua issued too many form commands.");
                    requests.add(new Navigation("showModal".equals(action) ? "modal" : action, lookup(supplied)));
                    return LuaValue.NIL;
                }
            });
        }
        // Dialogs are nonblocking. Lua receives Form_DialogResult(event) on the
        // originating form after the user responds; we never run Lua on the UI thread.
        ui.set("dialog", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                String kind = args.checkjstring(1).toLowerCase(java.util.Locale.ROOT);
                if (!("message".equals(kind) || "confirm".equals(kind) ||
                      "input".equals(kind) || "color".equals(kind) ||
                      "open".equals(kind) || "save".equals(kind))) {
                    throw new LuaError("Dialog kind must be message, confirm, input, color, open, or save.");
                }
                if (dialogs.length() >= 3) throw new LuaStudioDebugger.Limit("Too many dialogs in one event.");
                String title = formText(args.optjstring(2, "Dialog"), 60);
                String body = formText(args.optjstring(3, ""), 250);
                String suggested = formText(args.optjstring(4, ""), 100);
                if ("color".equals(kind) && !suggested.matches("#[0-9a-fA-F]{6}")) suggested = "#008080";
                int id = ++dialogSequence;
                try {
                    dialogs.put(new JSONObject().put("id", id).put("kind", kind)
                        .put("form", current.name).put("title", title.isEmpty() ? "Dialog" : title)
                        .put("message", body).put("defaultValue", suggested));
                } catch (JSONException error) {
                    throw new LuaError("Dialog could not be created.");
                }
                return LuaValue.valueOf(id);
            }
        });
        ui.set("message", new OneArgFunction() {
            @Override public LuaValue call(LuaValue supplied) {
                String text = formText(supplied.tojstring(), MAX_TEXT);
                if (message.isEmpty()) message = text;
                printLine("[Message] " + text);
                return LuaValue.NIL;
            }
        });
        LuaTable store = new LuaTable();
        store.set("get", new OneArgFunction() {
            @Override public LuaValue call(LuaValue supplied) {
                String key = storageKey(supplied.checkjstring());
                String value = storage.get(key);
                return value == null ? LuaValue.NIL : LuaValue.valueOf(value);
            }
        });
        store.set("set", new VarArgFunction() {
            @Override public Varargs invoke(Varargs args) {
                String key = storageKey(args.checkjstring(1));
                String value = formText(args.checkjstring(2), 256);
                if (args.checkjstring(2).length() > 256) throw new LuaError("Stored values cannot exceed 256 characters.");
                if (!storage.containsKey(key) && storage.size() >= 32)
                    throw new LuaError("A project can store up to 32 keys.");
                storage.put(key, value);
                storageDirty = true;
                return LuaValue.NONE;
            }
        });
        store.set("remove", new OneArgFunction() {
            @Override public LuaValue call(LuaValue supplied) {
                if (storage.remove(storageKey(supplied.checkjstring())) != null) storageDirty = true;
                return LuaValue.NIL;
            }
        });
        // File calls are deliberately asynchronous, just like CommonDialog. LuaJ
        // never accesses Android's filesystem from its isolated process.
        LuaTable files = new LuaTable();
        for (String action : new String[]{"read", "write", "list", "remove"}) {
            files.set(action, new VarArgFunction() {
                @Override public Varargs invoke(Varargs args) {
                    if (fileRequests.length() >= 4) throw new LuaError("Too many file operations in one event.");
                    String name = "list".equals(action) ? "" : fileName(args.checkjstring(1));
                    String text = "write".equals(action) ? args.checkjstring(2) : "";
                    if (text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 16384)
                        throw new LuaError("A file cannot exceed 16 KiB.");
                    int id = ++fileSequence;
                    try {
                        fileRequests.put(new JSONObject().put("id", id).put("form", current.name)
                                .put("action", action).put("name", name).put("text", text));
                    } catch (JSONException error) { throw new LuaError("Could not create file request."); }
                    return LuaValue.valueOf(id);
                }
            });
        }

        // All SQLite access is performed by the Android host, not LuaJ.
        // Each request is delivered asynchronously to Form_DatabaseResult.
        LuaTable db = new LuaTable();
        for (String operation : new String[]{"exec", "query"}) {
            db.set(operation, new VarArgFunction() {
                @Override public Varargs invoke(Varargs args) {
                    if (databaseRequests.length() >= 4) throw new LuaError("Too many database requests in one event.");
                    String sql = args.checkjstring(1);
                    if (sql.length() == 0 || sql.length() > 2048) throw new LuaError("SQL must contain 1–2048 characters.");
                    if (args.narg() > 5) throw new LuaError("At most four SQL parameters are allowed.");
                    JSONArray parameters = new JSONArray();
                    for (int i = 2; i <= args.narg(); i++) {
                        String value = args.arg(i).tojstring();
                        if (value.length() > 512) throw new LuaError("A SQL parameter is too long.");
                        parameters.put(value);
                    }
                    int id = ++databaseSequence;
                    try {
                        databaseRequests.put(new JSONObject().put("id", id).put("form", current.name)
                                .put("action", operation).put("sql", sql).put("params", parameters));
                    } catch (JSONException e) { throw new LuaError("Could not create database request."); }
                    return LuaValue.valueOf(id);
                }
            });
        }
        env.set("db", db);
        env.set("files", files);
        env.set("store", store);
        env.set("ui", ui);
        env.set("print", new VarArgFunction() {
            @Override public Varargs invoke(Varargs values) {
                StringBuilder content = new StringBuilder();
                for (int index = 1; index <= Math.min(20, values.narg()); index++) {
                    if (index > 1) content.append("    ");
                    content.append(formText(values.arg(index).tojstring(), MAX_TEXT));
                }
                printLine(shorten(content.toString(), 700));
                return LuaValue.NONE;
            }
        });
        return env;
    }

    private void patchColumns(Form form, String name, Control control) {
        if (++patchCount > 100) throw new LuaStudioDebugger.Limit("Too many control updates.");
        try {
            JSONObject page = patches.optJSONObject(form.name);
            if (page == null) { page = new JSONObject(); patches.put(form.name, page); }
            JSONObject changed = page.optJSONObject(name);
            if (changed == null) { changed = new JSONObject(); page.put(name, changed); }
            JSONArray values = new JSONArray();
            for (String item : control.columns) values.put(item);
            changed.put("columns", values);
        } catch (JSONException error) { throw new LuaError("Could not update columns."); }
    }

    private void patchItems(Form form, String name, Control control) {
        if (++patchCount > 100) throw new LuaStudioDebugger.Limit("Lua issued too many control updates in one event.");
        try {
            JSONObject page = patches.optJSONObject(form.name);
            if (page == null) { page = new JSONObject(); patches.put(form.name, page); }
            JSONObject changed = page.optJSONObject(name);
            if (changed == null) { changed = new JSONObject(); page.put(name, changed); }
            JSONArray items = new JSONArray();
            for (String item : control.choices) items.put(item);
            changed.put("items", items);
        } catch (JSONException error) {
            throw new LuaError("Could not update list items.");
        }
    }

    private static String fileName(String name) {
        if (!name.matches("[A-Za-z][A-Za-z0-9_-]{0,31}\\.(txt|csv|json)"))
            throw new LuaError("Use a simple .txt, .csv, or .json filename without folders.");
        return name;
    }

    private static String storageKey(String key) {
        if (!key.matches("[A-Za-z][A-Za-z0-9_-]{0,31}"))
            throw new LuaError("Storage keys must start with a letter and contain only letters, digits, _ or -.");
        return key;
    }

    private void uncheckPeers(Form form, Control choice) {
        for (Map.Entry<String, Control> entry : form.controls.entrySet()) {
            Control peer = entry.getValue();
            if (peer != choice && "option".equals(peer.type) && choice.group.equals(peer.group) &&
                    peer.get("checked").toboolean()) {
                peer.set("checked", LuaValue.FALSE);
                patch(form, entry.getKey(), "checked", LuaValue.FALSE);
            }
        }
    }

    private void patch(Form form, String name, String key, LuaValue value) {
        if (++patchCount > 100) throw new LuaStudioDebugger.Limit("Lua issued too many control updates in one event.");
        try {
            JSONObject page = patches.optJSONObject(form.name);
            if (page == null) { page = new JSONObject(); patches.put(form.name, page); }
            JSONObject changed = page.optJSONObject(name);
            if (changed == null) { changed = new JSONObject(); page.put(name, changed); }
            if (value.isboolean()) changed.put(key, value.toboolean());
            else if (value.type() == LuaValue.TNUMBER) changed.put(key, value.toint());
            else changed.put(key, value.tojstring());
        } catch (JSONException error) {
            throw new LuaError("Could not update the form.");
        }
    }

    private Form lookup(LuaValue name) {
        if (name.isnil()) return current;
        Form target = forms.get(name.checkjstring());
        if (target == null) throw new LuaError("Unknown form “" + shorten(name.tojstring(), 50) + "”.");
        return target;
    }

    private void printLine(String line) {
        if (output.length() < MAX_LOG_LINES) output.put(line);
        else if (output.length() == MAX_LOG_LINES) output.put("[More output suppressed for this event]");
    }

    private void begin() {
        debugger.reset();
        output = new JSONArray();
        patches = new JSONObject();
        presentation = new JSONArray();
        dialogs = new JSONArray();
        fileRequests = new JSONArray();
        databaseRequests = new JSONArray();
        requests.clear();
        message = "";
        patchCount = 0;
    }

    private void invokeArray(String name, int index, LuaValue value) {
        LuaValue handler = current.scope.rawget(name);
        if (handler.isnil()) return;
        if (!handler.isfunction()) throw new LuaError(name + " must be a function.");
        LuaValue first = LuaValue.valueOf(index);
        if (value.isnil()) handler.call(first);
        else handler.call(first, value);
    }

    private void invoke(String name, LuaValue value) {
        LuaValue handler = current.scope.rawget(name);
        if (handler.isnil()) return;
        if (!handler.isfunction()) throw new LuaError(name + " must be a function.");
        if (value.isnil()) handler.call();
        else handler.call(value);
    }

    private JSONObject result(String error, boolean ended) throws JSONException {
        JSONObject changed = legacy ? patches.optJSONObject(startup.name) : patches;
        JSONObject result = new JSONObject().put("output", output).put("patches", changed == null ? new JSONObject() : changed)
                .put("message", message).put("navigation", presentation).put("dialogs", dialogs).put("files", fileRequests)
                .put("database", databaseRequests).put("error", shorten(error, 5000)).put("ended", ended);
        if (storageDirty) {
            JSONObject saved = new JSONObject();
            for (Map.Entry<String, String> item : storage.entrySet()) saved.put(item.getKey(), item.getValue());
            result.put("storage", saved);
            storageDirty = false;
        }
        return result;
    }

    private static String identifier(String name) {
        if (!name.matches("[A-Za-z][A-Za-z0-9_]{0,31}")) throw new IllegalArgumentException("Invalid object name.");
        return name;
    }

    private static String source(String text) {
        if (text.length() > MAX_SCRIPT) throw new IllegalArgumentException("A Lua source file exceeds 60,000 characters.");
        return text;
    }

    static String shorten(String value, int limit) {
        if (value == null) return "";
        if (value.length() <= limit) return value;
        if (Character.isHighSurrogate(value.charAt(limit - 1))) limit--;
        return value.substring(0, limit);
    }

    private static String formText(String value, int limit) {
        String text = shorten(value, limit);
        StringBuilder output = new StringBuilder(text.length());
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            if (!Character.isISOControl(character) || character == '\n' || character == '\t') output.append(character);
        }
        return output.toString();
    }

    private static LuaValue scalar(Object value) {
        if (value instanceof Boolean) return LuaValue.valueOf((Boolean) value);
        if (value instanceof Number) return LuaValue.valueOf(((Number) value).intValue());
        if (value instanceof String) return LuaValue.valueOf(formText((String) value, MAX_TEXT));
        return LuaValue.NIL;
    }

    private static final class Navigation {
        final String action;
        final Form form;
        Navigation(String action, Form form) { this.action = action; this.form = form; }
    }

    private static final class Form {
        final String name;
        final JSONObject definition;
        final Map<String, Control> controls = new LinkedHashMap<>();
        final Set<String> menuItems = new HashSet<>();
        final Map<String, Set<Integer>> arrayIndexes = new LinkedHashMap<>();
        final Map<String, String> arrayTypes = new LinkedHashMap<>();
        Globals scope;
        boolean open;

        Form(String name, JSONObject definition) throws JSONException {
            this.name = name;
            this.definition = definition;
            reset();
            JSONArray menus = definition.optJSONArray("menus");
            if (menus == null) return;
            if (menus.length() > 10) throw new IllegalArgumentException("Too many menus.");
            for (int index = 0; index < menus.length(); index++) {
                JSONObject menu = menus.getJSONObject(index);
                if (!menu.optBoolean("enabled", true)) continue;
                JSONArray items = menu.optJSONArray("items");
                if (items == null || items.length() == 0) menuItems.add(identifier(menu.getString("name")));
                else {
                    if (items.length() > 14) throw new IllegalArgumentException("Too many menu items.");
                    for (int child = 0; child < items.length(); child++) {
                        JSONObject item = items.getJSONObject(child);
                        if (item.optBoolean("enabled", true)) menuItems.add(identifier(item.getString("name")));
                    }
                }
            }
        }

        void reset() throws JSONException {
            controls.clear();
            arrayIndexes.clear();
            arrayTypes.clear();
            Set<String> radioGroups = new HashSet<>();
            JSONArray definitions = definition.getJSONArray("controls");
            if (definitions.length() > MAX_CONTROLS) throw new IllegalArgumentException("Too many controls.");
            for (int index = 0; index < definitions.length(); index++) {
                JSONObject entry = definitions.getJSONObject(index);
                String key = identifier(entry.getString("name"));
                Control control = new Control(entry);
                if ("option".equals(control.type) && control.get("checked").toboolean() && !radioGroups.add(control.group)) {
                    control.set("checked", LuaValue.FALSE);
                }
                if (controls.put(key, control) != null) throw new IllegalArgumentException("Duplicate control name.");
                if (!control.arrayName.isEmpty()) {
                    String previousType = arrayTypes.putIfAbsent(control.arrayName, control.type);
                    if (previousType != null && !previousType.equals(control.type))
                        throw new IllegalArgumentException("Control array mixes control types.");
                    Set<Integer> members = arrayIndexes.computeIfAbsent(control.arrayName, ignored -> new HashSet<>());
                    if (!members.add(control.arrayIndex)) throw new IllegalArgumentException("Duplicate control array index.");
                }
            }
            for (String arrayName : arrayIndexes.keySet()) {
                if (controls.containsKey(arrayName)) throw new IllegalArgumentException("Control array shadows a control.");
            }
        }

        String arrayPhysicalName(String arrayName, int index) {
            if (arrayName.isEmpty() || !arrayIndexes.containsKey(arrayName))
                throw new LuaError("Unknown control array.");
            for (Map.Entry<String, Control> entry : controls.entrySet()) {
                Control control = entry.getValue();
                if (control.arrayName.equals(arrayName) && control.arrayIndex == index) return entry.getKey();
            }
            throw new LuaError("Unknown control array member.");
        }

        Control arrayControl(String name, int index) {
            return control(arrayPhysicalName(name, index));
        }

        Control control(String name) {
            Control control = controls.get(name);
            if (control == null) throw new LuaError("Unknown control “" + shorten(name, 50) + "”.");
            return control;
        }
    }

    private static final class Control {
        final String type;
        final String group;
        final String arrayName;
        final int arrayIndex;
        private final Map<String, LuaValue> values = new LinkedHashMap<>();
        private final Set<String> choices = new LinkedHashSet<>();
        private final java.util.List<String> columns = new java.util.ArrayList<>();
        private final int min;
        private final int max;

        Control(JSONObject definition) throws JSONException {
            type = definition.getString("type");
            group = shorten(definition.optString("group", "Group1"), 32);
            arrayName = definition.optString("arrayName", "");
            if (!arrayName.isEmpty()) identifier(arrayName);
            arrayIndex = arrayName.isEmpty() ? 0 : definition.optInt("arrayIndex", -1);
            if (arrayIndex < 0 || arrayIndex > 255) throw new IllegalArgumentException("Invalid array index.");
            if (!type.matches("label|button|text|multiline|check|option|combo|list|frame|hscroll|vscroll|progress|timer|shape|line|image|picture|treeview|listview|tabstrip|toolbar|statusbar")) {
                throw new IllegalArgumentException("Unknown control type.");
            }
            min = clamp(definition.optInt("min", 0), -10000, 9999);
            max = clamp(definition.optInt("max", 100), min + 1, 10000);
            JSONArray options = definition.optJSONArray("items");
            if (options != null) for (int index = 0; index < Math.min(24, options.length()); index++) {
                choices.add(formText(options.getString(index), 60));
            }
            JSONArray headings = "listview".equals(type) ? definition.optJSONArray("columns") : null;
            if (headings != null) for (int index = 0; index < Math.min(4, headings.length()); index++) {
                String heading = formText(headings.optString(index), 24).trim();
                if (!heading.isEmpty()) columns.add(heading);
            }
            values.put("visible", LuaValue.valueOf(definition.optBoolean("visible", true)));
            values.put("enabled", LuaValue.valueOf(definition.optBoolean("enabled", !"timer".equals(type))));
            if (type.matches("check|option")) values.put("checked", LuaValue.valueOf(definition.optBoolean("checked")));
            if (type.matches("list|combo|treeview|listview|tabstrip|toolbar")) {
                String option = formText(definition.optString("value"), 60);
                values.put("value", LuaValue.valueOf(choices.contains(option) ? option : ""));
            } else if (type.matches("hscroll|vscroll|progress")) {
                values.put("value", LuaValue.valueOf(clamp(definition.optInt("value"), min, max)));
            } else if (type.equals("timer")) {
                values.put("interval", LuaValue.valueOf(clamp(definition.optInt("interval", 1000), 100, 60000)));
            } else values.put("text", LuaValue.valueOf(formText(definition.optString("text"), MAX_TEXT)));
        }

        String defaultProperty() {
            if (type.matches("check|option")) return "checked";
            if (type.matches("list|combo|treeview|listview|tabstrip|toolbar|hscroll|vscroll|progress")) return "value";
            return type.equals("timer") ? "interval" : "text";
        }

        String inputProperty() {
            return type.matches("check|option|text|multiline|list|combo|treeview|listview|tabstrip|toolbar|hscroll|vscroll") ? defaultProperty() : null;
        }

        boolean fires(String action) {
            if ("Timer".equals(action)) return "timer".equals(type);
            if ("Change".equals(action)) return inputProperty() != null;
            if ("timer".equals(type)) return false;
            if ("Click".equals(action) || "DblClick".equals(action) ||
                    "MouseDown".equals(action) || "MouseUp".equals(action)) return true;
            return ("GotFocus".equals(action) || "LostFocus".equals(action) ||
                    "KeyDown".equals(action) || "KeyUp".equals(action)) &&
                    type.matches("button|text|multiline|check|option|combo|list|treeview|listview|tabstrip|toolbar|hscroll|vscroll");
        }

        String itemText() {
            if (!type.matches("list|combo|treeview|listview|tabstrip|toolbar"))
                throw new LuaError("This control has no items.");
            return String.join("\n", choices);
        }

        void setItems(String source) {
            if (!type.matches("list|combo|treeview|listview|tabstrip|toolbar"))
                throw new LuaError("This control has no items.");
            if (source.length() > 1500) throw new LuaError("The item list is too long.");
            Set<String> fresh = new LinkedHashSet<>();
            for (String item : source.split("\\n", -1)) {
                String value = formText(item.trim(), 60);
                if (!value.isEmpty()) fresh.add(value);
                if (fresh.size() > 24) throw new LuaError("A list can contain up to 24 items.");
            }
            choices.clear();
            choices.addAll(fresh);
            String currentValue = values.get("value").tojstring();
            if (!choices.contains(currentValue)) {
                values.put("value", LuaValue.valueOf(choices.isEmpty() ? "" : choices.iterator().next()));
            }
        }

        void setColumns(String source) {
            if (!"listview".equals(type)) throw new LuaError("Only ListView supports columns.");
            if (source.length() > 150) throw new LuaError("Column headings are too long.");
            String[] labels = source.split("\\t", -1);
            if (labels.length > 4) throw new LuaError("Use at most four column headings.");
            columns.clear();
            for (String label : labels) {
                String heading = formText(label, 24).trim();
                if (!heading.isEmpty()) columns.add(heading);
            }
        }

        LuaValue get(String property) {
            LuaValue value = values.get(property);
            if (value == null) throw new LuaError("Unknown property “" + shorten(property, 50) + "”.");
            return value;
        }

        void set(String property, LuaValue value) {
            LuaValue previous = get(property);
            if (previous.isboolean()) value = LuaValue.valueOf(value.checkboolean());
            else if (previous.type() == LuaValue.TNUMBER) {
                int low = "interval".equals(property) ? 100 : min;
                int high = "interval".equals(property) ? 60000 : max;
                value = LuaValue.valueOf(clamp(value.checkint(), low, high));
            } else {
                String text = formText(value.checkjstring(), MAX_TEXT);
                if ("value".equals(property) && !text.isEmpty() && !choices.contains(text)) {
                    throw new LuaError("Choose a value from the control’s list.");
                }
                value = LuaValue.valueOf(text);
            }
            values.put(property, value);
        }

        private static int clamp(int value, int minimum, int maximum) {
            return Math.max(minimum, Math.min(maximum, value));
        }
    }
}
