package com.retrodesktop.launcher;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.luaj.vm2.Lua;
import org.luaj.vm2.Globals;
import org.luaj.vm2.Upvaldesc;
import org.luaj.vm2.LuaClosure;
import org.luaj.vm2.LuaString;
import org.luaj.vm2.LuaValue;
import org.luaj.vm2.Varargs;
import org.luaj.vm2.lib.DebugLib;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

final class LuaStudioDebugger {
    private static final int EVENT_INSTRUCTIONS = 180_000;
    private static final int TOTAL_INSTRUCTIONS = 6_000_000;
    private final Map<String, Set<Integer>> breaks = new HashMap<>();
    private final List<String> watches = new ArrayList<>();
    private final ArrayDeque<Frame> frames = new ArrayDeque<>();
    private final Consumer<JSONObject> listener;
    private volatile boolean cancelled;
    private boolean waiting;
    private String resumeAction;
    private String mode = "";
    private int stepDepth;
    private int remaining = TOTAL_INSTRUCTIONS;
    private int instructions;
    private long deadline;
    private long joinedBytes;

    LuaStudioDebugger(JSONObject options, Consumer<JSONObject> listener) {
        this.listener = listener;
        JSONObject marks = options.optJSONObject("breakpoints");
        if (marks != null) marks.keys().forEachRemaining(file -> {
            if (breaks.size() >= 20 || !file.matches("[A-Za-z][A-Za-z0-9_]{0,31}\\.lua")) return;
            JSONArray lines = marks.optJSONArray(file);
            if (lines == null) return;
            HashSet<Integer> points = new HashSet<>();
            for (int index = 0; index < Math.min(lines.length(), 60); index++) {
                int line = lines.optInt(index);
                if (line > 0 && line <= 60000) points.add(line);
            }
            if (!points.isEmpty()) breaks.put(file, points);
        });
        JSONArray names = options.optJSONArray("watches");
        if (names != null) for (int index = 0; index < Math.min(names.length(), 12); index++) {
            String name = names.optString(index);
            if (name.matches("[A-Za-z_][A-Za-z0-9_]{0,31}") && !watches.contains(name)) watches.add(name);
        }
        if (listener != null && options.optBoolean("step")) mode = "into";
    }

    void reset() {
        if (cancelled) throw new Limit("Lua was stopped.");
        instructions = 0;
        deadline = System.nanoTime() + 800_000_000L;
    }

    synchronized void resume(String action) {
        if (!waiting || !("continue".equals(action) || "into".equals(action)
                || "over".equals(action) || "out".equals(action))) return;
        resumeAction = action;
        notifyAll();
    }

    synchronized void cancel() {
        cancelled = true;
        notifyAll();
    }

    DebugLib hook(Globals scope) {
        return new DebugLib() {
            @Override public void onCall(LuaClosure closure, Varargs args, LuaValue[] stack) {
                if (frames.size() >= 100) throw new Limit("Lua exceeded the function call limit. Press Run to restart.");
                frames.push(new Frame(closure, stack, scope));
                super.onCall(closure, args, stack);
            }

            @Override public void onReturn() {
                super.onReturn();
                frames.pop();
            }

            @Override public void onInstruction(int pc, Varargs args, int top) {
                before(pc);
                super.onInstruction(pc, args, top);
            }
        };
    }

    private void before(int pc) {
        if (cancelled) throw new Limit("Lua was stopped.");
        if (++instructions > EVENT_INSTRUCTIONS || --remaining <= 0 ||
                ((instructions & 511) == 0 && System.nanoTime() > deadline)) {
            throw new Limit("Lua reached the execution limit. Press Run to restart.");
        }
        Frame frame = frames.element();
        int op = frame.closure.p.code[pc];
        if (Lua.GET_OPCODE(op) == Lua.OP_CONCAT) {
            int bytes = 0;
            for (int index = Lua.GETARG_B(op); index <= Lua.GETARG_C(op); index++) {
                LuaValue item = frame.stack[index];
                bytes += item instanceof LuaString ? ((LuaString) item).length() : 32;
            }
            joinedBytes += bytes;
            if (bytes > 32_768 || joinedBytes > 16_777_216) {
                throw new Limit("Lua reached the string size limit. Press Run to restart.");
            }
        }
        if (listener == null) return;
        int line = frame.closure.p.lineinfo.length > pc ? frame.closure.p.lineinfo[pc] : 0;
        boolean atNewLine = line != frame.line || pc < frame.pc;
        frame.pc = pc;
        frame.line = line;
        if (line <= 0 || !atNewLine) return;
        int depth = frames.size();
        Set<Integer> fileBreaks = breaks.get(frame.file);
        if ((fileBreaks != null && fileBreaks.contains(line)) || "into".equals(mode)
                || ("over".equals(mode) && depth <= stepDepth) || ("out".equals(mode) && depth < stepDepth)) {
            pause(frame, depth);
        }
    }

    private synchronized void pause(Frame frame, int depth) {
        long start = System.nanoTime();
        waiting = true;
        resumeAction = null;
        try {
            listener.accept(snapshot(frame));
            while (resumeAction == null && !cancelled) wait();
            if (cancelled) throw new Limit("Lua was stopped.");
            stepDepth = depth;
            mode = resumeAction;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new Limit("Lua was stopped.");
        } finally {
            waiting = false;
            deadline += System.nanoTime() - start;
        }
    }

    private JSONObject snapshot(Frame frame) {
        try {
            JSONArray locals = new JSONArray();
            Map<String, LuaValue> localValues = new HashMap<>();
            for (int index = 0; index < Math.min(frame.stack.length, 24); index++) {
                LuaString name = frame.closure.p.getlocalname(index + 1, frame.pc);
                if (name == null) break;
                LuaValue value = frame.stack[index];
                localValues.put(name.tojstring(), value == null ? LuaValue.NIL : value);
                locals.put(record(name.tojstring(), value));
            }
            JSONArray observed = new JSONArray();
            for (String name : watches) {
                LuaValue value = localValues.get(name);
                if (value == null) value = frame.upvalue(name);
                if (value == null) value = frame.scope.get(name);
                observed.put(record(name, value));
            }
            JSONArray stack = new JSONArray();
            for (Frame entry : frames) {
                if (stack.length() >= 18) break;
                stack.put(entry.file + ":" + entry.line);
            }
            return new JSONObject().put("file", frame.file).put("line", frame.line).put("locals", locals).put("stack", stack).put("watches", observed);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static JSONObject record(String name, LuaValue value) throws JSONException {
        return new JSONObject().put("name", name).put("value",
                LuaStudioRuntime.shorten(value == null ? "nil" : value.tojstring(), 140));
    }

    static final class Limit extends Error {
        Limit(String reason) { super(reason); }
    }

    private static final class Frame {
        final LuaClosure closure;
        final LuaValue[] stack;
        final String file;
        final Globals scope;
        int line = -1;
        int pc = -1;

        Frame(LuaClosure closure, LuaValue[] stack, Globals scope) {
            this.closure = closure;
            this.stack = stack;
            this.scope = scope;
            this.file = closure.p.shortsource();
        }

        LuaValue upvalue(String name) {
            Upvaldesc[] values = closure.p.upvalues;
            if (values == null) return null;
            for (int index = 0; index < values.length; index++) {
                if (values[index].name != null && values[index].name.tojstring().equals(name)) {
                    return closure.upValues[index].getValue();
                }
            }
            return null;
        }
    }
}
