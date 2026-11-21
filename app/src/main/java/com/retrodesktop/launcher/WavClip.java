package com.retrodesktop.launcher;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

final class WavClip {
    static final int HEADER = 44;
    static final int MAX_SECONDS = 300;
    static final int BINS = 128;

    final int rate;
    final int frames;

    WavClip(int rate, int frames) {
        this.rate = rate;
        this.frames = frames;
    }

    int millis() {
        return (int) ((frames * 1000L + rate - 1) / rate);
    }

    void finish(File file) throws IOException {
        int size = Math.multiplyExact(frames, 2);
        ByteBuffer header = ByteBuffer.allocate(HEADER).order(ByteOrder.LITTLE_ENDIAN);
        header.put(ascii("RIFF")).putInt(size + 36).put(ascii("WAVE")).put(ascii("fmt ")).putInt(16);
        header.putShort((short) 1).putShort((short) 1).putInt(rate).putInt(rate * 2);
        header.putShort((short) 2).putShort((short) 16).put(ascii("data")).putInt(size);
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
            if (output.length() != HEADER + size) throw new IOException("The audio file is incomplete.");
            output.write(header.array());
            output.getFD().sync();
        }
    }

    static WavClip read(File file) throws IOException {
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            byte[] bytes = new byte[HEADER];
            input.readFully(bytes);
            ByteBuffer header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
            int rate = header.getInt(24);
            int size = header.getInt(40);
            if (!id(bytes, 0, "RIFF") || !id(bytes, 8, "WAVE") || !id(bytes, 12, "fmt ") ||
                    !id(bytes, 36, "data") || rate < 8000 || rate > 48000 ||
                    header.getInt(4) != size + 36 || header.getInt(16) != 16 ||
                    header.getShort(20) != 1 || header.getShort(22) != 1 || header.getShort(34) != 16 ||
                    size < 2 || (size & 1) != 0 || size > rate * MAX_SECONDS * 2 ||
                    input.length() != HEADER + size) {
                throw new IOException("The recording draft is invalid.");
            }
            return new WavClip(rate, size / 2);
        }
    }

    void slice(File source, File destination, int startMs, int endMs) throws IOException {
        int first = (int) Math.max(0, Math.min(frames, startMs * (long) rate / 1000));
        int end = (int) Math.max(0, Math.min(frames, (endMs * (long) rate + 999) / 1000));
        if (end <= first) throw new IOException("Choose a recording range.");
        int remaining = (end - first) * 2;
        try (RandomAccessFile input = new RandomAccessFile(source, "r");
             RandomAccessFile output = new RandomAccessFile(destination, "rw")) {
            input.seek(HEADER + first * 2L);
            output.setLength(0);
            output.write(new byte[HEADER]);
            byte[] block = new byte[16_384];
            while (remaining > 0) {
                int count = Math.min(remaining, block.length);
                input.readFully(block, 0, count);
                output.write(block, 0, count);
                remaining -= count;
            }
        }
        new WavClip(rate, end - first).finish(destination);
    }

    int[] waveform(File file) throws IOException {
        int[] peaks = new int[BINS];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(HEADER);
            byte[] block = new byte[16_384];
            for (int position = 0; position < frames;) {
                int chunk = Math.min(frames - position, block.length / 2);
                input.readFully(block, 0, chunk * 2);
                for (int offset = 0; offset < chunk; offset++) {
                    int cell = (int) ((position + (long) offset) * BINS / frames);
                    short sample = (short) ((block[offset * 2] & 255) | (block[offset * 2 + 1] << 8));
                    peaks[cell] = Math.max(peaks[cell], Math.abs((int) sample));
                }
                position += chunk;
            }
        }
        for (int index = 0; index < peaks.length; index++) peaks[index] = Math.min(100, peaks[index] * 100 / 32767);
        return peaks;
    }

    private static boolean id(byte[] data, int position, String expected) {
        return expected.equals(new String(data, position, 4, StandardCharsets.US_ASCII));
    }

    private static byte[] ascii(String value) {
        return value.getBytes(StandardCharsets.US_ASCII);
    }
}
