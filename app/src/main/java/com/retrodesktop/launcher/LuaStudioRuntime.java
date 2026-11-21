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
    private final ArrayDeque<Navigation> requests = new ArrayDeque<>();
    private String message;
    private int patchCount;

    LuaStudioRuntime(JSONObject project) throws JSONException {
        this(project, new LuaStudioDebugger(new JSONObject(), null));
    }

    LuaStudioRuntime(JSONObject project, LuaStudioDebugger debugger) throws JSONException {
        this.debugger = debugger;
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
            if (receiver == null || !receiver.open) return result("", false);
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
                invoke(name + "_" + action, "Change".equals(action) && control.inputProperty() != null
                        ? control.get(control.inputProperty()) : eventDetails(input));
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
        for (String key : new String[]{"x", "y", "button"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(Math.max(-4096, Math.min(4096, raw.optInt(key)))));
        }
        for (String key : new String[]{"shift", "ctrl", "alt"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(raw.optBoolean(key)));
        }
        for (String key : new String[]{"key", "code"}) {
            if (raw.has(key)) values.set(key, LuaValue.valueOf(shorten(raw.optString(key), 40)));
        }
        return values;
    }

    private static boolean isFormEvent(String action) {
        return "Click".equals(action) || "DblClick".equals(action) || "MouseDown".equals(action)
                || "MouseUp".equals(action) || "KeyDown".equals(action) || "KeyUp".equals(action);
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
                case "show":
                    if (target.scope == null) load(target, source(target.definition.getString("code")));
                    target.open = true;
                    presentation.put(change("show", target.name));
                    invoke("Form_Activate", LuaValue.NIL);
                    break;
                case "hide":
                    target.open = false;
                    presentation.put(change("hide", target.name));
                    break;
                case "unload":
                    try {
                        if (target.scope != null) invoke("Form_Unload", LuaValue.NIL);
                    } finally {
                        target.open = false;
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
        for (String action : new String[]{"show", "hide", "unload"}) {
            ui.set(action, new OneArgFunction() {
                @Override public LuaValue call(LuaValue supplied) {
                    if (requests.size() >= 20) throw new LuaStudioDebugger.Limit("Lua issued too many form commands.");
                    requests.add(new Navigation(action, lookup(supplied)));
                    return LuaValue.NIL;
                }
            });
        }
        ui.set("message", new OneArgFunction() {
            @Override public LuaValue call(LuaValue supplied) {
                String text = formText(supplied.tojstring(), MAX_TEXT);
                if (message.isEmpty()) message = text;
                printLine("[Message] " + text);
                return LuaValue.NIL;
            }
        });
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
        requests.clear();
        message = "";
        patchCount = 0;
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
        return new JSONObject().put("output", output).put("patches", changed == null ? new JSONObject() : changed)
                .put("message", message).put("navigation", presentation)
                .put("error", shorten(error, 5000)).put("ended", ended);
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
            }
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
        private final Map<String, LuaValue> values = new LinkedHashMap<>();
        private final Set<String> choices = new HashSet<>();
        private final int min;
        private final int max;

        Control(JSONObject definition) throws JSONException {
            type = definition.getString("type");
            group = shorten(definition.optString("group", "Group1"), 32);
            if (!type.matches("label|button|text|multiline|check|option|combo|list|frame|hscroll|vscroll|progress|timer|shape|line|image|picture")) {
                throw new IllegalArgumentException("Unknown control type.");
            }
            min = clamp(definition.optInt("min", 0), -10000, 9999);
            max = clamp(definition.optInt("max", 100), min + 1, 10000);
            JSONArray options = definition.optJSONArray("items");
            if (options != null) for (int index = 0; index < Math.min(24, options.length()); index++) {
                choices.add(formText(options.getString(index), 60));
            }
            values.put("visible", LuaValue.valueOf(definition.optBoolean("visible", true)));
            values.put("enabled", LuaValue.valueOf(definition.optBoolean("enabled", !"timer".equals(type))));
            if (type.matches("check|option")) values.put("checked", LuaValue.valueOf(definition.optBoolean("checked")));
            if (type.matches("list|combo")) {
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
            if (type.matches("list|combo|hscroll|vscroll|progress")) return "value";
            return type.equals("timer") ? "interval" : "text";
        }

        String inputProperty() {
            return type.matches("check|option|text|multiline|list|combo|hscroll|vscroll") ? defaultProperty() : null;
        }

        boolean fires(String action) {
            if ("Timer".equals(action)) return "timer".equals(type);
            if ("Change".equals(action)) return inputProperty() != null;
            if ("timer".equals(type)) return false;
            if ("Click".equals(action) || "DblClick".equals(action) ||
                    "MouseDown".equals(action) || "MouseUp".equals(action)) return true;
            return ("GotFocus".equals(action) || "LostFocus".equals(action) ||
                    "KeyDown".equals(action) || "KeyUp".equals(action)) &&
                    type.matches("button|text|multiline|check|option|combo|list|hscroll|vscroll");
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
