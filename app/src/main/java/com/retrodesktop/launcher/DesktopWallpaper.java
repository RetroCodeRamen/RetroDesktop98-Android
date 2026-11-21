package com.retrodesktop.launcher;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.util.AtomicFile;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

final class DesktopWallpaper {
    private static final int MAX_DIMENSION = 2048;
    private static final Object LOCK = new Object();
    private final ContentResolver resolver;
    private final AtomicFile file;

    DesktopWallpaper(ContentResolver resolver, File directory) {
        this.resolver = resolver;
        this.file = new AtomicFile(new File(directory, "wallpaper.jpg"));
    }

    String readEncoded() {
        synchronized (LOCK) {
            try (InputStream stream = file.openRead()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[16384];
                for (int count; (count = stream.read(buffer)) != -1;) output.write(buffer, 0, count);
                return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            } catch (IOException ignored) {
                return null;
            }
        }
    }

    void save(Uri uri) throws IOException {
        Bitmap image = decode(uri);
        if (image == null) throw new IOException("Image could not be decoded");
        save(image);
    }

    private static BitmapFactory.Options imageInfo(byte[] bytes) throws IOException {
        BitmapFactory.Options info = new BitmapFactory.Options();
        info.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, info);
        if (info.outWidth < 1 || info.outHeight < 1 || Math.max(info.outWidth, info.outHeight) > MAX_DIMENSION) {
            throw new IOException("Invalid wallpaper dimensions");
        }
        return info;
    }

    void restoreJpeg(byte[] bytes) throws IOException {
        BitmapFactory.Options info = imageInfo(bytes);
        if (!"image/jpeg".equals(info.outMimeType)) throw new IOException("Unsupported wallpaper");
        Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (decoded == null) throw new IOException("Invalid wallpaper");
        decoded.recycle();
        write(output -> output.write(bytes));
    }

    void saveImage(byte[] bytes) throws IOException {
        imageInfo(bytes);
        Bitmap image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (image == null) throw new IOException("Invalid wallpaper image");
        save(image);
    }

    private void save(Bitmap image) throws IOException {
        try {
            write(output -> {
                if (!image.compress(Bitmap.CompressFormat.JPEG, 90, output)) {
                    throw new IOException("Image could not be saved");
                }
            });
        } finally {
            image.recycle();
        }
    }

    private interface Writer {
        void write(FileOutputStream output) throws IOException;
    }

    private void write(Writer writer) throws IOException {
        synchronized (LOCK) {
            FileOutputStream output = file.startWrite();
            try {
                writer.write(output);
                file.finishWrite(output);
            } catch (IOException | RuntimeException error) {
                file.failWrite(output);
                throw error;
            }
        }
    }

    void remove() {
        synchronized (LOCK) {
            file.delete();
        }
    }

    private Bitmap decode(Uri uri) throws IOException {
        if (Build.VERSION.SDK_INT >= 28) {
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri), (decoder, info, source) -> {
                int width = info.getSize().getWidth();
                int height = info.getSize().getHeight();
                int largest = Math.max(width, height);
                if (largest > MAX_DIMENSION) {
                    float ratio = MAX_DIMENSION / (float) largest;
                    decoder.setTargetSize(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
                }
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
            });
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream stream = open(uri)) {
            BitmapFactory.decodeStream(stream, null, options);
        }
        options.inJustDecodeBounds = false;
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > MAX_DIMENSION) {
            options.inSampleSize *= 2;
        }
        try (InputStream stream = open(uri)) {
            return BitmapFactory.decodeStream(stream, null, options);
        }
    }

    private InputStream open(Uri uri) throws FileNotFoundException {
        InputStream stream = resolver.openInputStream(uri);
        if (stream == null) throw new FileNotFoundException("Image stream is unavailable");
        return stream;
    }
}
