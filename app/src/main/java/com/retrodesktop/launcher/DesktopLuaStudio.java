package com.retrodesktop.launcher;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

final class DesktopLuaStudio implements ServiceConnection {
    static final int MAX_SESSIONS = 5;
    private static final String DISCONNECTED = "The Lua engine disconnected. Reopen the program to restart.";
    private final DesktopActivity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Messenger replies = new Messenger(new Handler(Looper.getMainLooper(), this::receive));
    private final Map<String, Session> sessions = new LinkedHashMap<>();
    private Messenger service;
    private boolean bound;

    DesktopLuaStudio(DesktopActivity activity) {
        this.activity = activity;
    }

    void command(String action, String key, String data) {
        Session session = sessions.get(key);
        if ("start".equals(action)) {
            if (session != null) return;
            if (sessions.size() >= MAX_SESSIONS) {
                report(key, "Close a Lua program before opening another.");
                return;
            }
            session = new Session(key);
            sessions.put(key, session);
            Message launch = request(LuaStudioService.START, key, data);
            if (service != null) {
                send(session, launch);
                return;
            }
            session.launch = launch;
            handler.postDelayed(session.timeout, 8000);
            if (!bound) {
                try {
                    bound = activity.bindService(new Intent(activity, LuaStudioService.class), this, Context.BIND_AUTO_CREATE);
                } catch (SecurityException error) {
                    bound = false;
                }
                if (!bound) failAll("Could not start the Lua engine.");
            }
            return;
        }
        if (session == null) return;
        if ("stop".equals(action)) stop(session);
        else if ("event".equals(action) && service != null) send(session, request(LuaStudioService.EVENT, key, data));
        else if ("resume".equals(action) && service != null) send(session, request(LuaStudioService.RESUME, key, data));
    }

    private Message request(int what, String key, String data) {
        Message message = Message.obtain(null, what);
        Bundle payload = new Bundle();
        payload.putString("session", key);
        payload.putString("data", data);
        message.setData(payload);
        message.replyTo = replies;
        return message;
    }

    private boolean receive(Message reply) {
        if (reply.what != LuaStudioService.RESULT) return true;
        Bundle data = reply.getData();
        String key = data.getString("session", "");
        Session session = sessions.get(key);
        if (session == null) return true;
        handler.removeCallbacks(session.timeout);
        try {
            JSONObject result = new JSONObject(data.getString("result", "{}"));
            result.put("session", key).put("type", data.getString("type"));
            if (result.optBoolean("ended")) sessions.remove(key);
            activity.sendObject("luaRuntimeEvent", result);
        } catch (JSONException error) {
            fail(session, "Could not read the Lua response.");
        }
        return true;
    }

    private void send(Session session, Message message) {
        try {
            service.send(message);
            handler.removeCallbacks(session.timeout);
            handler.postDelayed(session.timeout, 6000);
        } catch (RemoteException error) {
            failAll(DISCONNECTED);
        }
    }

    private void stop(Session session) {
        handler.removeCallbacks(session.timeout);
        sessions.remove(session.key);
        if (service == null || session.launch != null) return;
        try {
            service.send(request(LuaStudioService.STOP, session.key, ""));
        } catch (RemoteException ignored) {
            // The isolated process already exited.
        }
    }

    private void fail(Session session, String reason) {
        if (sessions.get(session.key) != session) return;
        stop(session);
        if (sessions.isEmpty() && service == null) release();
        report(session.key, reason);
    }

    private void failAll(String reason) {
        release();
        for (Session session : new ArrayList<>(sessions.values())) {
            handler.removeCallbacks(session.timeout);
            sessions.remove(session.key);
            report(session.key, reason);
        }
    }

    private void report(String key, String reason) {
        try {
            activity.sendObject("luaRuntimeEvent", new JSONObject().put("session", key)
                    .put("type", "closed").put("error", reason).put("ended", true));
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    void close() {
        for (Session session : new ArrayList<>(sessions.values())) stop(session);
        release();
    }

    private void release() {
        if (bound) activity.unbindService(this);
        bound = false;
        service = null;
    }

    @Override public void onServiceConnected(ComponentName component, IBinder binder) {
        service = new Messenger(binder);
        for (Session session : new ArrayList<>(sessions.values())) {
            if (service == null) break;
            if (session.launch != null) {
                Message launch = session.launch;
                session.launch = null;
                send(session, launch);
            }
        }
    }

    @Override public void onServiceDisconnected(ComponentName component) { failAll(DISCONNECTED); }
    @Override public void onBindingDied(ComponentName component) { failAll(DISCONNECTED); }
    @Override public void onNullBinding(ComponentName component) { failAll("Could not start the Lua engine."); }

    private final class Session {
        final String key;
        final Runnable timeout = () -> fail(this, "The Lua program stopped responding.");
        Message launch;

        Session(String key) { this.key = key; }
    }
}
