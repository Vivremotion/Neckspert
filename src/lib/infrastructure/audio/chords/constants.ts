/**
 * Chord verification by fitting harmonic combs (the `nnls-abs` judge of the triad detection
 * spike, docs/superpowers/specs/2026-10-06-triades-detection-spike.md). Every value is a
 * starting point, to calibrate.
 */

/** Analysis window length the transform size is fitted to (8192 points at 48 kHz). */
export const TARGET_WINDOW_S = 0.17;

/** A spectrum every FFT_SIZE / HOP_DIVISOR samples (1024 at 48 kHz, about 21 ms). */
export const HOP_DIVISOR = 8;

/** Reports after each attack, at these window lengths. */
export const REPORT_POINTS_MS: readonly number[] = [250, 500, 1000, 2000];

/** MIDI notes a comb is built for. Beyond them a candidate scores 0. */
export const NOTE_LO = 52;
export const NOTE_HI = 84;

/** Spectrum range the fit explains. */
export const MIN_HZ = 70;
export const COMB_MAX_HZ = 5000;

/**
 * Spectrum range sent to the diagnostic journal with each report: wide enough for the whitening
 * bands, so variants can be replayed exactly later.
 */
export const SPECTRUM_KEEP_MIN_HZ = 20;
export const SPECTRUM_KEEP_MAX_HZ = 6300;

export const COMB_HARMONICS = 10;
/** Gaussian width of each partial, in bins. */
export const COMB_WIDTH_BINS = 1.6;
/** String inharmonicity coefficient B. */
export const COMB_INHARMONICITY = 1e-4;

/** Klapuri's whitening exponent. */
export const WHITENING_NU = 0.33;

/** Below this ratio (weakest / strongest note energy), the score is scaled down. */
export const PRESENCE_RATIO = 0.15;

/** The power of two nearest to TARGET_WINDOW_S at this sample rate. */
export function fftSizeFor(sampleRate: number): number {
	return 2 ** Math.round(Math.log2(TARGET_WINDOW_S * sampleRate));
}

export function hopSizeFor(sampleRate: number): number {
	return fftSizeFor(sampleRate) / HOP_DIVISOR;
}
