package com.retrodesktop.launcher;

import android.content.Context;
import android.text.Html;

import org.json.JSONObject;

import java.io.File;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import javax.mail.AuthenticationFailedException;
import javax.mail.internet.AddressException;

final class DesktopMail {
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private final MailAccountStore storage;
    private final File cache;
    private final Consumer<Attachment> openAttachment;

    DesktopMail(Context context, Consumer<Attachment> openAttachment) {
        storage = new MailAccountStore(context);
        cache = context.getCacheDir();
        this.openAttachment = openAttachment;
    }

    static final class Attachment {
        final String name;
        final String mime;
        final File file;
        final boolean save;

        Attachment(String name, String mime, File file, boolean save) {
            this.name = DesktopDocuments.name(name);
            this.mime = mime;
            this.file = file;
            this.save = save;
        }
    }

    private void loadAttachment(JSONObject request) throws Exception {
        File file = File.createTempFile("desktop-mail-", ".tmp", cache);
        boolean delivered = false;
        try {
            JSONObject info;
            try (OutputStream stream = Files.newOutputStream(file.toPath())) {
                info = MailProtocol.attachment(account(), request.getString("id"), request.getString("path"), stream);
            }
            openAttachment.accept(new Attachment(info.getString("name"), info.getString("type"), file,
                    request.optBoolean("save")));
            delivered = true;
        } finally {
            if (!delivered) file.delete();
        }
    }

    void command(String action, String request, String data, Consumer<JSONObject> callback) {
        WORKER.execute(() -> {
            JSONObject reply = new JSONObject();
            try {
                reply.put("action", action).put("request", request);
                switch (action) {
                    case "status": {
                        MailProtocol.Account account = storage.read();
                        reply.put("account", account == null ? JSONObject.NULL : account.settings(false));
                        break;
                    }
                    case "save": {
                        MailProtocol.Account account = new MailProtocol.Account(new JSONObject(data));
                        storage.write(account);
                        reply.put("account", account.settings(false));
                        break;
                    }
                    case "remove":
                        storage.remove();
                        reply.put("account", JSONObject.NULL);
                        break;
                    case "list":
                        reply.put("messages", MailProtocol.inbox(account()));
                        break;
                    case "read":
                        reply.put("message", MailProtocol.read(account(), data,
                                html -> Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString()));
                        break;
                    case "attach":
                        loadAttachment(new JSONObject(data));
                        break;
                    case "send":
                        MailProtocol.send(account(), new JSONObject(data));
                        break;
                    default: return;
                }
            } catch (Exception error) {
                try {
                    reply.put("error", describe(action, error));
                } catch (Exception invalidResult) {
                    return;
                }
            }
            callback.accept(reply);
        });
    }

    private MailProtocol.Account account() throws Exception {
        MailProtocol.Account account = storage.read();
        if (account == null) throw new IllegalArgumentException("Set up an email account first.");
        return account;
    }

    private static String describe(String action, Exception error) {
        if (error instanceof AuthenticationFailedException) {
            return "Sign-in failed. Check your username, app password, and server settings.";
        }
        if (error instanceof AddressException) return "Enter a valid email address.";
        if (error instanceof IllegalArgumentException && error.getMessage() != null) return error.getMessage();
        switch (action) {
            case "status": return "Couldn’t open the saved account. Enter your account settings again.";
            case "save": return "Couldn’t save the account securely.";
            case "remove": return "Couldn’t remove the account.";
            case "send": return "Couldn’t confirm the send. Check your server and Sent folder before trying again.";
            case "attach": return "Couldn’t retrieve this attachment.";
            case "read": return "Couldn’t open that message. Refresh the inbox and try again.";
            default: return "Couldn’t connect to the inbox. Check your connection and mail server settings.";
        }
    }

}
