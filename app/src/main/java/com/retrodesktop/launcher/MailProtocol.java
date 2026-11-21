package com.retrodesktop.launcher;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.Properties;
import java.util.function.Function;
import javax.mail.Address;
import javax.mail.FetchProfile;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.MessagingException;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.UIDFolder;
import javax.mail.internet.AddressException;
import javax.mail.internet.ContentType;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeUtility;
import javax.net.ssl.SSLContext;

final class MailProtocol {
    private static final int MESSAGE_LIMIT = 50;
    private static final int TEXT_BYTES = 128 * 1024;
    private static final int MAX_ATTACHMENTS = 32;
    private static final int ATTACHMENT_BYTES = 12 * 1024 * 1024;

    static final class Account {
        final String address;
        final String username;
        final String password;
        final String imapHost;
        final int imapPort;
        final String smtpHost;
        final int smtpPort;
        final boolean startTls;

        Account(JSONObject input) throws AddressException {
            String actual = input.optString("address").trim();
            if (actual.length() > 320 || controls(actual)) throw new AddressException("Invalid email address");
            InternetAddress sender = new InternetAddress(actual, true);
            sender.validate();
            if (sender.isGroup()) throw new AddressException("Invalid email address");
            address = sender.getAddress();
            username = input.optString("username").trim().isEmpty() ? address : input.optString("username").trim();
            password = input.optString("password");
            imapHost = host(input.optString("imapHost"));
            imapPort = port(input.optInt("imapPort"));
            smtpHost = host(input.optString("smtpHost"));
            smtpPort = port(input.optInt("smtpPort"));
            startTls = input.optBoolean("startTls");
            if (username.length() > 320 || controls(username) || password.isEmpty() || password.length() > 1024) {
                throw new IllegalArgumentException("Enter a username and mail password or app password.");
            }
        }

        JSONObject settings(boolean includePassword) throws JSONException {
            JSONObject result = new JSONObject().put("address", address).put("username", username)
                    .put("imapHost", imapHost).put("imapPort", imapPort).put("smtpHost", smtpHost)
                    .put("smtpPort", smtpPort).put("startTls", startTls);
            if (includePassword) result.put("password", password);
            return result;
        }

        private static String host(String value) {
            String name = value.trim();
            if (!name.matches("[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?")) {
                throw new IllegalArgumentException("Enter mail server hostnames without a URL or port.");
            }
            return name;
        }

        private static int port(int value) {
            if (value < 1 || value > 65535) throw new IllegalArgumentException("Enter valid server ports.");
            return value;
        }
    }

    static JSONArray inbox(Account account) throws Exception {
        return withInbox(account, (folder, uids) -> {
            JSONArray messages = new JSONArray();
            int total = folder.getMessageCount();
            if (total == 0) return messages;
            Message[] recent = folder.getMessages(Math.max(1, total - MESSAGE_LIMIT + 1), total);
            FetchProfile profile = new FetchProfile();
            profile.add(FetchProfile.Item.ENVELOPE);
            profile.add(UIDFolder.FetchProfileItem.UID);
            folder.fetch(recent, profile);
            long validity = uids.getUIDValidity();
            for (int index = recent.length - 1; index >= 0; index--) {
                Message message = recent[index];
                long uid = uids.getUID(message);
                if (uid > 0) messages.put(summary(message).put("id", validity + ":" + uid));
            }
            return messages;
        });
    }

    static JSONObject read(Account account, String key, Function<String, String> htmlText) throws Exception {
        checkMessageKey(key);
        return withInbox(account, (folder, uids) -> {
            Message item = messageByKey(uids, key);
            Body body = findBody(item, 0);
            String plain = body == null ? "" : body.html ? htmlText.apply(body.text) : body.text;
            plain = plain.replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", "");
            Address[] reply = item.getReplyTo();
            String replyAddress = "";
            if (reply != null && reply.length > 0 && reply[0] instanceof InternetAddress) {
                replyAddress = ((InternetAddress) reply[0]).getAddress();
            }
            String[] messageIds = item.getHeader("Message-ID");
            JSONArray files = new JSONArray();
            collectAttachments(item, "", 0, files, new int[]{160});
            return summary(item).put("id", key).put("body", plain).put("replyTo", replyAddress)
                    .put("attachments", files).put("messageId", messageIds == null || messageIds.length == 0 ? "" : cap(messageIds[0], 512));
        });
    }

    static JSONObject attachment(Account account, String key, String path, OutputStream destination) throws Exception {
        checkMessageKey(key);
        if (!path.matches("(?:[0-9]{1,2}/){0,7}[0-9]{1,2}|root")) {
            throw new IllegalArgumentException("Choose an attachment.");
        }
        return withInbox(account, (folder, uids) -> {
            Part part = messageByKey(uids, key);
            if (!"root".equals(path)) {
                for (String step : path.split("/")) {
                    Multipart children = parts(part);
                    int index = Integer.parseInt(step);
                    if (children == null || index >= children.getCount() || index >= 40 || isAttachment(part)) {
                        throw new IllegalArgumentException("This attachment is unavailable.");
                    }
                    part = children.getBodyPart(index);
                }
            }
            if (!isAttachment(part)) throw new IllegalArgumentException("This attachment is unavailable.");
            if (part.getSize() > ATTACHMENT_BYTES * 2) throw new IllegalArgumentException("This attachment exceeds 12 MB.");
            try (InputStream data = part.getInputStream()) {
                long total = 0;
                byte[] buffer = new byte[8192];
                for (int count; (count = data.read(buffer)) != -1;) {
                    total += count;
                    if (total > ATTACHMENT_BYTES) throw new IllegalArgumentException("This attachment exceeds 12 MB.");
                    destination.write(buffer, 0, count);
                }
            }
            return attachmentDetails(part, path);
        });
    }

    private static void checkMessageKey(String key) {
        if (!key.matches("[0-9]{1,10}:[0-9]{1,10}")) throw new IllegalArgumentException("Choose a message.");
    }

    private static Message messageByKey(UIDFolder uids, String key) throws Exception {
        String[] ids = key.split(":");
        if (uids.getUIDValidity() != Long.parseLong(ids[0])) {
            throw new IllegalArgumentException("The inbox changed. Refresh it, then select the message again.");
        }
        Message item = uids.getMessageByUID(Long.parseLong(ids[1]));
        if (item == null) throw new IllegalArgumentException("This message is gone. Refresh the inbox.");
        return item;
    }

    private static boolean isAttachment(Part part) throws MessagingException {
        return Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition()) || part.getFileName() != null;
    }

    private static Multipart parts(Part part) throws Exception {
        if (!part.isMimeType("multipart/*")) return null;
        Object content = part.getContent();
        return content instanceof Multipart ? (Multipart) content : null;
    }

    private static void collectAttachments(Part part, String path, int depth, JSONArray found, int[] remaining)
            throws Exception {
        if (depth > 8 || found.length() >= MAX_ATTACHMENTS || --remaining[0] < 0) return;
        if (isAttachment(part)) {
            found.put(attachmentDetails(part, path.isEmpty() ? "root" : path));
            return;
        }
        Multipart children = parts(part);
        if (children == null) return;
        for (int index = 0; index < Math.min(40, children.getCount()); index++) {
            collectAttachments(children.getBodyPart(index), path.isEmpty() ? String.valueOf(index) : path + "/" + index,
                    depth + 1, found, remaining);
        }
    }

    private static JSONObject attachmentDetails(Part part, String path) throws Exception {
        String filename = part.getFileName();
        if (filename == null || filename.trim().isEmpty()) filename = "Attachment";
        try { filename = MimeUtility.decodeText(filename); } catch (Exception ignored) { }
        String type = "application/octet-stream";
        try { type = new ContentType(part.getContentType()).getBaseType().toLowerCase(Locale.ROOT); }
        catch (Exception ignored) { }
        return new JSONObject().put("path", path).put("name", cap(filename, 255)).put("type", type);
    }

    static void send(Account account, JSONObject draft) throws Exception {
        String recipients = draft.optString("to");
        if (recipients.length() > 2048 || controls(recipients)) throw new AddressException("Invalid recipient");
        InternetAddress[] to = InternetAddress.parse(recipients, true);
        if (to.length == 0 || to.length > 20) throw new IllegalArgumentException("Enter between one and 20 recipients.");
        for (InternetAddress recipient : to) {
            recipient.validate();
            if (recipient.isGroup() || controls(recipient.getAddress())) throw new AddressException("Invalid recipient");
        }
        String subject = draft.optString("subject").trim();
        String body = draft.optString("body");
        if (subject.length() > 300 || controls(subject) || body.length() > 40_000) {
            throw new IllegalArgumentException("The subject or message is too long or contains an invalid character.");
        }
        String protocol = account.startTls ? "smtp" : "smtps";
        Session session = session(protocol);
        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(account.address, true));
        message.setRecipients(Message.RecipientType.TO, to);
        message.setSubject(subject, "UTF-8");
        message.setText(body, "UTF-8");
        message.setSentDate(new Date());
        String parent = draft.optString("inReplyTo");
        if (parent.length() <= 512 && parent.matches("<[^<>\\s\\p{Cntrl}]+>")) {
            message.setHeader("In-Reply-To", parent);
            message.setHeader("References", parent);
        }
        message.saveChanges();
        Transport transport = session.getTransport(protocol);
        try {
            transport.connect(account.smtpHost, account.smtpPort, account.username, account.password);
            transport.sendMessage(message, to);
        } finally {
            close(transport);
        }
    }

    private static boolean controls(String value) {
        return value.chars().anyMatch(Character::isISOControl);
    }

    private static JSONObject summary(Message item) throws Exception {
        Address[] senders = item.getFrom();
        String from = senders != null && senders.length > 0 ? senders[0].toString() : "Unknown sender";
        if (senders != null && senders.length > 0 && senders[0] instanceof InternetAddress) {
            from = ((InternetAddress) senders[0]).toUnicodeString();
        }
        Date date = item.getSentDate();
        String subject = cap(item.getSubject(), 300);
        return new JSONObject().put("from", cap(from, 400)).put("subject", subject)
                .put("date", date == null ? 0 : date.getTime());
    }

    private interface InboxOperation<T> {
        T use(Folder folder, UIDFolder uids) throws Exception;
    }

    private static <T> T withInbox(Account account, InboxOperation<T> operation) throws Exception {
        Store store = session("imaps").getStore("imaps");
        try {
            store.connect(account.imapHost, account.imapPort, account.username, account.password);
            Folder folder = store.getFolder("INBOX");
            if (!(folder instanceof UIDFolder)) throw new MessagingException("The provider does not expose IMAP message IDs.");
            folder.open(Folder.READ_ONLY);
            try {
                return operation.use(folder, (UIDFolder) folder);
            } finally {
                try { folder.close(false); } catch (MessagingException ignored) {}
            }
        } finally {
            close(store);
        }
    }

    private static Session session(String protocol) throws Exception {
        Properties options = new Properties();
        String prefix = "mail." + protocol + ".";
        options.setProperty(prefix + "connectiontimeout", "12000");
        options.setProperty(prefix + "timeout", "16000");
        options.setProperty(prefix + "writetimeout", "16000");
        options.setProperty(prefix + "ssl.checkserveridentity", "true");
        boolean modernTls = Arrays.asList(SSLContext.getDefault().getSupportedSSLParameters().getProtocols()).contains("TLSv1.3");
        options.setProperty(prefix + "ssl.protocols", modernTls ? "TLSv1.3 TLSv1.2" : "TLSv1.2");
        if ("smtp".equals(protocol)) {
            options.setProperty(prefix + "starttls.enable", "true");
            options.setProperty(prefix + "starttls.required", "true");
        } else {
            options.setProperty(prefix + "ssl.enable", "true");
        }
        options.setProperty(prefix + "auth", "true");
        if ("imaps".equals(protocol)) {
            options.setProperty(prefix + "peek", "true");
            options.setProperty(prefix + "partialfetch", "true");
        }
        return Session.getInstance(options);
    }

    private static void close(javax.mail.Service service) {
        try { service.close(); } catch (MessagingException ignored) {}
    }

    private static Body findBody(Part part, int depth) throws Exception {
        if (depth > 8 || Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition()) || part.getFileName() != null) return null;
        if (part.isMimeType("text/plain") || part.isMimeType("text/html")) {
            Charset charset = StandardCharsets.UTF_8;
            try {
                String name = new ContentType(part.getContentType()).getParameter("charset");
                if (name != null) charset = Charset.forName(MimeUtility.javaCharset(name));
            } catch (Exception ignored) {}
            try (InputStream stream = part.getInputStream()) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] block = new byte[8192];
                while (buffer.size() < TEXT_BYTES) {
                    int count = stream.read(block, 0, Math.min(block.length, TEXT_BYTES - buffer.size()));
                    if (count < 0) break;
                    buffer.write(block, 0, count);
                }
                String text = new String(buffer.toByteArray(), charset);
                if (buffer.size() == TEXT_BYTES) text += "\n\n[Message preview truncated]";
                return new Body(text, part.isMimeType("text/html"));
            }
        }
        if (part.isMimeType("multipart/*")) {
            Object content = part.getContent();
            if (!(content instanceof Multipart)) return null;
            Multipart multipart = (Multipart) content;
            Body alternative = null;
            for (int index = 0; index < Math.min(40, multipart.getCount()); index++) {
                Body body = findBody(multipart.getBodyPart(index), depth + 1);
                if (body == null) continue;
                if (!body.html) return body;
                if (alternative == null) alternative = body;
            }
            return alternative;
        }
        return null;
    }

    private static String cap(String value, int limit) {
        return value == null ? "" : value.substring(0, Math.min(limit, value.length()));
    }

    private static final class Body {
        final String text;
        final boolean html;

        Body(String text, boolean html) {
            this.text = text;
            this.html = html;
        }
    }
}
