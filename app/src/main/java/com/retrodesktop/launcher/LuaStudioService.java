package com.retrodesktop.launcher;

import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;

import org.json.JSONException;
import org.json.JSONObject;
import org.luaj.vm2.LuaError;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LuaStudioService extends Service {
    static final int START = 1;
    static final int EVENT = 2;
    static final int STOP = 3;
    static final int RESULT = 4;
    static final int RESUME = 5;
    private final Map<IBinder, Map<String, RunningProject>> clients = new HashMap<>();
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper(), this::process);
    private final Messenger inbox = new Messenger(main);

    @Override public IBinder onBind(Intent intent) {
        return inbox.getBinder();
    }

    @Override public void onDestroy() {
        for (Map<String, RunningProject> projects : clients.values()) {
            for (RunningProject project : projects.values()) project.debugger.cancel();
        }
        clients.clear();
        workers.shutdownNow();
        super.onDestroy();
    }

    private boolean process(Message request) {
        if (request.replyTo == null) return true;
        IBinder caller = request.replyTo.getBinder();
        Bundle payload = request.getData();
        String session = payload.getString("session", "");
        if (session.isEmpty() || session.length() > 60) return true;
        Map<String, RunningProject> projects = clients.get(caller);
        RunningProject running = projects == null ? null : projects.get(session);
        String data = payload.getString("data", "");
        if (data.length() > LuaStudioRuntime.MAX_PAYLOAD) return true;
        if (request.what == START) {
            if (running != null) return true;
            if (projects != null && projects.size() >= DesktopLuaStudio.MAX_SESSIONS) {
                send(request.replyTo, session, "start", failure("Close a Lua program before opening another."));
                return true;
            }
            try {
                JSONObject input = new JSONObject(data);
                JSONObject options = input.optJSONObject("_debug");
                RunningProject project = new RunningProject(request.replyTo, session, options);
                clients.computeIfAbsent(caller, ignored -> new HashMap<>()).put(session, project);
                run(project, "start", () -> {
                    project.runtime = new LuaStudioRuntime(input, project.debugger);
                    return project.runtime.startProject();
                });
            } catch (JSONException error) {
                send(request.replyTo, session, "start", failure("This Lua project is invalid."));
            }
        } else if (running != null) {
            if (request.what == STOP) stop(running);
            if (request.what == RESUME) running.debugger.resume(data);
            if (request.what == EVENT && !running.busy) {
                run(running, "event", () -> running.runtime.event(new JSONObject(data)));
            }
        } else if (request.what == EVENT) {
            send(request.replyTo, session, "event", failure("The preview stopped. Press Run to restart."));
        }
        return true;
    }

    private boolean owns(RunningProject project) {
        Map<String, RunningProject> projects = clients.get(project.caller);
        return projects != null && projects.get(project.session) == project;
    }

    private void stop(RunningProject project) {
        if (!owns(project)) return;
        Map<String, RunningProject> projects = clients.get(project.caller);
        projects.remove(project.session);
        if (projects.isEmpty()) clients.remove(project.caller);
        project.debugger.cancel();
    }

    private interface Operation {
        JSONObject execute() throws JSONException;
    }

    private void run(RunningProject project, String type, Operation work) {
        project.busy = true;
        workers.execute(() -> {
            JSONObject result;
            try {
                result = work.execute();
            } catch (StackOverflowError error) {
                result = failure("Lua exceeded the nesting limit. Check the code and press Run again.");
            } catch (JSONException | IllegalArgumentException | LuaError | LuaStudioDebugger.Limit error) {
                result = failure(LuaStudioRuntime.shorten(error.getMessage(), 450));
            }
            JSONObject reply = result;
            main.post(() -> {
                if (!owns(project)) return;
                project.busy = false;
                if (reply.optBoolean("ended")) stop(project);
                send(project.replies, project.session, type, reply);
            });
        });
    }

    private static void send(Messenger destination, String session, String type, JSONObject result) {
        Message reply = Message.obtain(null, RESULT);
        Bundle data = new Bundle();
        data.putString("session", session);
        data.putString("type", type);
        data.putString("result", result.toString());
        reply.setData(data);
        try { destination.send(reply); } catch (RemoteException ignored) { }
    }

    private static JSONObject failure(String error) {
        try {
            return new JSONObject().put("error", error == null || error.isEmpty() ? "Could not start the Lua program." : error)
                    .put("ended", true);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private final class RunningProject {
        final Messenger replies;
        final IBinder caller;
        final String session;
        final LuaStudioDebugger debugger;
        LuaStudioRuntime runtime;
        boolean busy;

        RunningProject(Messenger replies, String session, JSONObject options) {
            this.replies = replies;
            this.caller = replies.getBinder();
            this.session = session;
            this.debugger = new LuaStudioDebugger(options == null ? new JSONObject() : options,
                    pause -> main.post(() -> {
                        if (owns(this)) send(replies, session, "pause", pause);
                    }));
        }
    }
}
