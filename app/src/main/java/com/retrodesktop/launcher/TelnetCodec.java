package com.retrodesktop.launcher;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

final class TelnetCodec {
    private static final int IAC = 255, WILL = 251, WONT = 252, DO = 253, DONT = 254, SB = 250, SE = 240;
    private static final int BINARY = 0, ECHO = 1, SGA = 3, TTYPE = 24, NAWS = 31;
    private static final int DATA = 0, ESCAPE = 1, OPTION = 2, SUB_OPTION = 3, SUB_DATA = 4, SUB_ESCAPE = 5;
    private static final byte[] TERMINAL = "ANSI".getBytes(StandardCharsets.US_ASCII);
    private final int width, height;
    private final boolean[] local = new boolean[256];
    private final boolean[] remote = new boolean[256];
    private int state, command, option, subFirst = -1, subLength;
    private boolean pendingCR;

    TelnetCodec(int width, int height) {
        this.width = width;
        this.height = height;
    }

    byte[] read(byte[] bytes, int count, OutputStream reply) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(count);
        for (int index = 0; index < count; index++) {
            int value = bytes[index] & 255;
            switch (state) {
                case DATA:
                    if (value == IAC) state = ESCAPE;
                    else append(output, value);
                    break;
                case ESCAPE:
                    if (value == IAC) {
                        append(output, value);
                        state = DATA;
                    } else if (value >= WILL && value <= DONT) {
                        command = value;
                        state = OPTION;
                    } else state = value == SB ? SUB_OPTION : DATA;
                    break;
                case OPTION:
                    negotiate(command, value, reply);
                    state = DATA;
                    break;
                case SUB_OPTION:
                    option = value;
                    subFirst = -1;
                    subLength = 0;
                    state = SUB_DATA;
                    break;
                case SUB_DATA:
                    if (value == IAC) state = SUB_ESCAPE;
                    else subByte(value);
                    break;
                case SUB_ESCAPE:
                    if (value == SE) {
                        if (option == TTYPE && subLength == 1 && subFirst == 1 && local[TTYPE]) {
                            reply.write(new byte[]{(byte) IAC, (byte) SB, TTYPE, 0});
                            reply.write(TERMINAL);
                            reply.write(new byte[]{(byte) IAC, (byte) SE});
                        }
                        state = DATA;
                    } else {
                        if (value == IAC) subByte(value);
                        state = SUB_DATA;
                    }
                    break;
            }
        }
        return output.toByteArray();
    }

    private void subByte(int value) {
        if (subLength == 0) subFirst = value;
        if (subLength < 2) subLength++;
    }

    boolean remoteEcho() { return remote[ECHO]; }

    private void append(ByteArrayOutputStream output, int value) {
        if ((!pendingCR || value != 0) || remote[BINARY]) output.write(value);
        pendingCR = value == '\r';
    }

    private void negotiate(int verb, int option, OutputStream reply) throws IOException {
        if (verb == DO) {
            if (option != SGA && option != BINARY && option != TTYPE && option != NAWS) send(reply, WONT, option);
            else if (!local[option]) {
                local[option] = true;
                send(reply, WILL, option);
                if (option == NAWS) {
                    reply.write(new byte[]{(byte) IAC, (byte) SB, NAWS});
                    escaped(reply, width >> 8);
                    escaped(reply, width & 255);
                    escaped(reply, height >> 8);
                    escaped(reply, height & 255);
                    reply.write(new byte[]{(byte) IAC, (byte) SE});
                }
            }
        } else if (verb == WILL) {
            if (option != ECHO && option != SGA && option != BINARY) send(reply, DONT, option);
            else if (!remote[option]) {
                remote[option] = true;
                send(reply, DO, option);
            }
        } else if (verb == DONT && local[option]) {
            local[option] = false;
            send(reply, WONT, option);
        } else if (verb == WONT && remote[option]) {
            remote[option] = false;
            send(reply, DONT, option);
        }
    }

    void write(OutputStream output, byte[] bytes) throws IOException {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream(bytes.length);
        for (int index = 0; index < bytes.length; index++) {
            int value = bytes[index] & 255;
            escaped(encoded, value);
            if (!local[BINARY] && value == '\r' &&
                    (index + 1 == bytes.length || (bytes[index + 1] != '\n' && bytes[index + 1] != 0))) {
                encoded.write(0);
            }
        }
        output.write(encoded.toByteArray());
    }

    private static void send(OutputStream output, int verb, int option) throws IOException {
        output.write(new byte[]{(byte) IAC, (byte) verb, (byte) option});
    }

    private static void escaped(OutputStream output, int value) throws IOException {
        output.write(value);
        if (value == IAC) output.write(value);
    }
}
