package com.retrodesktop.launcher;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

final class DesktopTerminal {
    private static final int MAX_SEND = 8192;
    private final Consumer<JSONObject> listener;
    private final ExecutorService readers = Executors.newFixedThreadPool(2);
    private final ThreadPoolExecutor writers = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));
    private Session current;

    DesktopTerminal(Consumer<JSONObject> listener) { this.listener = listener; }

    void command(String action, String id, String data) {
        if (!id.matches("[a-zA-Z0-9-]{1,45}")) return;
        if ("connect".equals(action)) connect(id, data);
        else if ("send".equals(action)) send(id, data);
        else if ("disconnect".equals(action)) {
            synchronized (this) {
                if (current != null && current.id.equals(id)) disconnect("Disconnected.");
            }
        }
    }

    private synchronized void connect(String id, String data) {
        try {
            JSONObject setup = new JSONObject(data);
            String host = setup.getString("host").trim();
            if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
            if (!host.matches("[A-Za-z0-9.:_-]{1,253}")) throw new IllegalArgumentException();
            int port = setup.getInt("port");
            String transport = setup.getString("transport");
            if (port < 1 || port > 65535 || (!"telnet".equals(transport) && !"tcp".equals(transport))) {
                throw new IllegalArgumentException();
            }
            disconnect("Disconnected.");
            Session session = new Session(id, host, port, "telnet".equals(transport));
            current = session;
            event(id, "connecting", "Connecting to " + host + "…", null, null);
            readers.execute(() -> read(session));
        } catch (JSONException | IllegalArgumentException | RejectedExecutionException error) {
            event(id, "closed", "Enter a hostname or IP address and a port from 1 to 65535.", null, null);
        }
    }

    private void read(Session session) {
        if (!isCurrent(session)) return;
        try {
            session.socket.connect(new InetSocketAddress(session.host, session.port), 8000);
            session.socket.setTcpNoDelay(true);
            session.output = session.socket.getOutputStream();
            if (!emit(session, "connected", "Connected to " + session.host + ":" + session.port, null)) return;
            InputStream input = session.socket.getInputStream();
            byte[] buffer = new byte[4096];
            boolean echoed = false;
            long previous = 0;
            for (int count; isCurrent(session) && (count = input.read(buffer)) != -1;) {
                byte[] data;
                if (session.telnet == null) data = Arrays.copyOf(buffer, count);
                else {
                    synchronized (session) {
                        data = session.telnet.read(buffer, count, session.output);
                        if (session.telnet.remoteEcho() != echoed) {
                            echoed = session.telnet.remoteEcho();
                            if (!emit(session, "echo", "", echoed)) break;
                        }
                    }
                }
                if (data.length > 0) {
                    long remaining = 18 - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - previous);
                    if (remaining > 0) Thread.sleep(remaining);
                    previous = System.nanoTime();
                    synchronized (this) {
                        if (current != session) break;
                        event(session.id, "data", "", Base64.getEncoder().encodeToString(data), null);
                    }
                }
            }
            finish(session, "The remote host closed the connection.");
        } catch (Exception error) {
            String detail = error instanceof UnknownHostException ? "Could not find that hostname." :
                    error instanceof SocketTimeoutException ? "The connection timed out." :
                    error instanceof ConnectException ? "Could not connect to that host and port." :
                    "The connection ended.";
            finish(session, detail);
        } finally {
            session.close();
        }
    }

    private void send(String id, String data) {
        Session session;
        synchronized (this) { session = current; }
        if (session == null || session.output == null || !session.id.equals(id) || data.length() > MAX_SEND * 2) return;
        try {
            byte[] bytes = Base64.getDecoder().decode(data);
            if (bytes.length == 0 || bytes.length > MAX_SEND) return;
            writers.execute(() -> {
                if (!isCurrent(session)) return;
                try {
                    synchronized (session) {
                        if (session.telnet == null) session.output.write(bytes);
                        else session.telnet.write(session.output, bytes);
                    }
                } catch (IOException error) { finish(session, "Could not send data. The connection ended."); }
            });
        } catch (IllegalArgumentException ignored) {
        } catch (RejectedExecutionException error) {
            emit(session, "notice", "The connection is busy. Try sending again.", null);
        }
    }

    private synchronized boolean isCurrent(Session session) { return current == session; }

    private synchronized boolean emit(Session session, String status, String message, Boolean echo) {
        if (current != session) return false;
        event(session.id, status, message, null, echo);
        return true;
    }

    private synchronized void finish(Session session, String message) {
        if (current != session) return;
        current = null;
        session.close();
        event(session.id, "closed", message, null, null);
    }

    synchronized void disconnect(String detail) {
        if (current != null) finish(current, detail);
    }

    void close() {
        disconnect("Disconnected.");
        readers.shutdownNow();
        writers.shutdownNow();
    }

    private void event(String id, String status, String message, String data, Boolean echo) {
        try {
            JSONObject event = new JSONObject().put("id", id).put("status", status).put("message", message);
            if (data != null) event.put("data", data);
            if (echo != null) event.put("echo", echo);
            listener.accept(event);
        } catch (JSONException ignored) { }
    }

    private static final class Session {
        final String id, host;
        final int port;
        final TelnetCodec telnet;
        final Socket socket = new Socket();
        volatile OutputStream output;

        Session(String id, String host, int port, boolean telnet) {
            this.id = id;
            this.host = host;
            this.port = port;
            this.telnet = telnet ? new TelnetCodec(80, 24) : null;
        }

        void close() {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }
}
