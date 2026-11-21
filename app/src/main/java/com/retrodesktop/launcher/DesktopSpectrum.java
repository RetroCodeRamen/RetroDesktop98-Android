package com.retrodesktop.launcher;

import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Handler;

import java.io.IOException;
import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

final class DesktopSpectrum {
    private static final int FRAME_MS = 160;
    private static final int SEGMENT_MS = FRAME_MS * 36;
    private final Context context;
    private final Handler dispatcher;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(task -> new Thread(() -> {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
        task.run();
    }, "RetroSpectrum"));
    private Future<?> pending;
    private volatile long generation;
    private Uri source;
    private int segment = -1;
    private int activeSegment = -1;
    private int previousSegment = -1;
    private int[][] frames;
    private int[][] previousFrames;
    private boolean failed;

    DesktopSpectrum(Context context, Handler dispatcher) {
        this.context = context;
        this.dispatcher = dispatcher;
    }

    void setTrack(Uri uri) {
        reset();
        source = uri;
        failed = false;
    }

    void reset() {
        generation++;
        if (pending != null) pending.cancel(true);
        pending = null;
        segment = activeSegment = previousSegment = -1;
        frames = previousFrames = null;
    }

    int[] at(int position) {
        if (source == null || failed || position < 0) return null;
        int requested = position / SEGMENT_MS * SEGMENT_MS;
        if (requested != segment && requested != previousSegment && requested != activeSegment) request(requested);
        else if (position - requested > SEGMENT_MS - 750 && activeSegment < 0 && segment == requested) {
            request(requested + SEGMENT_MS);
        }
        int index = (position - requested) / FRAME_MS;
        if (requested == segment && frames != null) return frames[index];
        if (requested == previousSegment && previousFrames != null) return previousFrames[index];
        return null;
    }

    private void request(int start) {
        if (pending != null) pending.cancel(true);
        long version = ++generation;
        Uri uri = source;
        activeSegment = start;
        pending = worker.submit(() -> {
            int[][] result;
            boolean unavailable = false;
            try {
                result = decode(uri, start, version);
            } catch (IOException | RuntimeException error) {
                unavailable = true;
                result = null;
            }
            int[][] analyzed = result;
            boolean noDecoder = unavailable;
            dispatcher.post(() -> {
                if (version != generation) return;
                activeSegment = -1;
                pending = null;
                failed = noDecoder;
                previousSegment = segment;
                previousFrames = frames;
                segment = start;
                frames = analyzed;
            });
        });
    }

    private int[][] decode(Uri uri, int start, long version) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        try {
            extractor.setDataSource(context, uri, null);
            MediaFormat format = null;
            for (int index = 0; index < extractor.getTrackCount(); index++) {
                MediaFormat candidate = extractor.getTrackFormat(index);
                String mime = candidate.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    format = candidate;
                    extractor.selectTrack(index);
                    break;
                }
            }
            if (format == null) throw new IOException("No audio track");
            extractor.seekTo(start * 1000L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            if (version != generation || Thread.currentThread().isInterrupted()) return null;
            codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
            codec.configure(format, null, null, 0);
            codec.start();
            return readFrames(extractor, codec, format, start, version);
        } finally {
            try {
                if (codec != null) codec.release();
            } finally {
                extractor.release();
            }
        }
    }

    private int[][] readFrames(MediaExtractor extractor, MediaCodec codec, MediaFormat format, int start, long version)
            throws IOException {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        FrameSampler sampler = new FrameSampler(start);
        while (version == generation && !Thread.currentThread().isInterrupted()) {
            if (sampler.input) feed(extractor, codec, sampler, start);
            int output = codec.dequeueOutputBuffer(info, 2000);
            if (output == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                format = codec.getOutputFormat();
            } else if (output >= 0) {
                try {
                    ByteBuffer bytes = codec.getOutputBuffer(output);
                    if (bytes != null && info.size > 0) {
                        ((Buffer) bytes).position(info.offset).limit(info.offset + info.size);
                        sampler.read(bytes.order(ByteOrder.nativeOrder()), format, info.presentationTimeUs);
                    }
                } finally {
                    codec.releaseOutputBuffer(output, false);
                }
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0 ||
                        info.presentationTimeUs >= (start + SEGMENT_MS) * 1000L) return sampler.frames;
            }
            if (System.nanoTime() > sampler.deadline) return sampler.frames;
        }
        return null;
    }

    private static void feed(MediaExtractor extractor, MediaCodec codec, FrameSampler sampler, int start) throws IOException {
        int index = codec.dequeueInputBuffer(3000);
        if (index < 0) return;
        ByteBuffer bytes = codec.getInputBuffer(index);
        if (bytes == null) throw new IOException("Decoder input unavailable");
        ((Buffer) bytes).clear();
        long timestamp = extractor.getSampleTime();
        int size = timestamp > (start + SEGMENT_MS + 300) * 1000L ? -1 : extractor.readSampleData(bytes, 0);
        if (size < 0) {
            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            sampler.input = false;
        } else {
            codec.queueInputBuffer(index, 0, size, Math.max(0, timestamp), 0);
            extractor.advance();
        }
    }

    private static final class FrameSampler {
        final int start;
        final long deadline = System.nanoTime() + 3_000_000_000L;
        final int[][] frames = new int[SEGMENT_MS / FRAME_MS][];
        final float[] samples = new float[SpectrumBands.SAMPLE_COUNT];
        final SpectrumBands analyzer = new SpectrumBands();
        boolean input = true;
        int last = -1;
        int count;

        FrameSampler(int start) { this.start = start; }

        void read(ByteBuffer bytes, MediaFormat format, long timestamp) {
            int rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            int encoding = format.containsKey(MediaFormat.KEY_PCM_ENCODING)
                    ? format.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
            if (rate <= 0 || channels < 1 || channels > 16 ||
                    (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT)) return;
            boolean floating = encoding == AudioFormat.ENCODING_PCM_FLOAT;
            int stride = channels * (floating ? 4 : 2);
            int first = bytes.position();
            int limit = bytes.remaining() / stride;
            for (int index = 0; index < limit; index++) {
                double ms = (timestamp / 1000.0) + index * 1000.0 / rate - start;
                if (ms < 0) continue;
                int slot = (int) (ms / FRAME_MS);
                if (slot >= frames.length) break;
                if (slot != last) { last = slot; count = 0; }
                if (frames[slot] != null) continue;
                int offset = first + index * stride;
                float value = 0;
                for (int channel = 0; channel < channels; channel++) {
                    value += floating ? bytes.getFloat(offset + channel * 4) :
                            bytes.getShort(offset + channel * 2) / 32768f;
                }
                samples[count++] = value / channels;
                if (count == samples.length) frames[slot] = analyzer.measure(samples, rate);
            }
        }
    }
}
