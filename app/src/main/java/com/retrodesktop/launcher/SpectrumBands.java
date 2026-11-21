package com.retrodesktop.launcher;

final class SpectrumBands {
    static final int SAMPLE_COUNT = 512;
    private static final int BAND_COUNT = 12;
    private static final double[] WINDOW = new double[SAMPLE_COUNT];

    static {
        for (int i = 0; i < SAMPLE_COUNT; i++) {
            WINDOW[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (SAMPLE_COUNT - 1));
        }
    }

    private final double[] real = new double[SAMPLE_COUNT];
    private final double[] imaginary = new double[SAMPLE_COUNT];

    int[] measure(float[] samples, int rate) {
        for (int i = 0; i < SAMPLE_COUNT; i++) {
            int reverse = Integer.reverse(i) >>> (32 - Integer.numberOfTrailingZeros(SAMPLE_COUNT));
            real[reverse] = samples[i] * WINDOW[i];
            imaginary[reverse] = 0;
        }
        for (int length = 2; length <= SAMPLE_COUNT; length *= 2) {
            int half = length / 2;
            double angle = -2 * Math.PI / length;
            double stepRe = Math.cos(angle);
            double stepIm = Math.sin(angle);
            for (int first = 0; first < SAMPLE_COUNT; first += length) {
                double rotateRe = 1;
                double rotateIm = 0;
                for (int j = first; j < first + half; j++) {
                    int other = j + half;
                    double re = real[other] * rotateRe - imaginary[other] * rotateIm;
                    double im = real[other] * rotateIm + imaginary[other] * rotateRe;
                    real[other] = real[j] - re;
                    imaginary[other] = imaginary[j] - im;
                    real[j] += re;
                    imaginary[j] += im;
                    double nextRe = rotateRe * stepRe - rotateIm * stepIm;
                    rotateIm = rotateRe * stepIm + rotateIm * stepRe;
                    rotateRe = nextRe;
                }
            }
        }
        int[] bands = new int[BAND_COUNT];
        double low = Math.max(40, rate / (double) SAMPLE_COUNT);
        double high = Math.max(low + 1, Math.min(14500, rate * 0.49));
        double scale = BAND_COUNT / Math.log(high / low);
        for (int bin = 1; bin < SAMPLE_COUNT / 2; bin++) {
            double hz = rate * bin / (double) SAMPLE_COUNT;
            if (hz > high) break;
            int band = Math.max(0, Math.min(BAND_COUNT - 1, (int) (Math.log(hz / low) * scale)));
            double level = Math.hypot(real[bin], imaginary[bin]) * 4 / SAMPLE_COUNT;
            double db = 20 * Math.log10(Math.max(0.00001, level));
            bands[band] = Math.max(bands[band], (int) Math.max(0, Math.min(100, (db + 58) * 100 / 58)));
        }
        // Very low frequencies can share a bin at common sample rates.
        for (int index = 1; index < 4; index++) {
            if (bands[index] == 0) bands[index] = (bands[index - 1] * 2 + bands[index + 1]) / 4;
        }
        return bands;
    }
}
