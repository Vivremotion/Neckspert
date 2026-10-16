/** An onset is never refined to closer than this to the previous attack's. */
export const MIN_ATTACK_GAP_MS = 25;

/**
 * Flux peaks closer than this are one attack (a strum's strings, a flam, the pick touching the
 * string before the note sounds), timed at the strongest. Through an interface a picked note often
 * gives a faint peak then, 25–40 ms later, the note itself some 25 dB louder (real practice,
 * 2026-10-16). The fastest rhythm the app targets, 32nds at 160 bpm, are 47 ms apart.
 */
export const ATTACK_MERGE_MS = 45;

/**
 * SuperFlux (Böck and Widmer, DAFx 2013) tuned for a guitar. Times are in milliseconds, so the
 * tracker behaves the same at any sample rate.
 */
export interface AttackConfig {
	/** Analysis window; the FFT size is the power of 2 nearest to it in samples. */
	windowMs: number;
	/** Step between two analysis frames. */
	hopMs: number;
	/** Distance between a frame and its reference frame (SuperFlux's μ). */
	lagMs: number;
	/** Width, in bands, of the maximum filter run over the reference frame. */
	maxFilterBands: number;
	/** A peak is the largest flux from `preMaxMs` before it to `postMaxMs` after it. */
	preMaxMs: number;
	postMaxMs: number;
	/** A peak stands `delta` above the mean flux from `preAvgMs` before it to `postAvgMs` after. */
	preAvgMs: number;
	postAvgMs: number;
	/** Threshold above the local mean, in units of the log-band flux. */
	delta: number;
	minGapMs: number;
	/** Peaks closer than this to the strongest one held are merged into it. */
	mergeMs: number;
	/** Below this window RMS, the input is silence and has no flux. */
	minRms: number;
	/** Strength 1 needs at least this flux, so a lone soft attack is not full strength. */
	strengthFloor: number;
}

/**
 * Tuned on the synthetic signals of the spec and the real triads of `chords/fixtures/`:
 * - `preMaxMs` 20, not 30: plucks 50 ms apart must stay apart, and a window as long as the gap
 *   lets the first, stronger peak hide the next one;
 * - `mergeMs` 45: peaks closer than that are one attack, timed at the strongest, so a pick's touch
 *   before its note is not an attack of its own (plucks 30 ms apart are now one attack);
 * - `delta` 3.5 and `preAvgMs` 50: the flux of a real strum peaks around 16–32, an arpeggiated
 *   note over ringing strings around 6–14, the noise of a DI input under 2.5, of the built-in
 *   mic (gain 8) up to 6. Over 50 ms the mean still holds a strum's first string, so its later
 *   strings (a roll 35 ms apart, fixture 12) stay under the threshold, while a lone note does
 *   not. Every value of `delta` from 3.25 to 3.75 passes the fixtures;
 * - `strengthFloor` 40: a firm synthetic pick gives a flux around 55, a −26 dBFS one around 22.
 */
export const DEFAULT_ATTACK_CONFIG: AttackConfig = {
	windowMs: 46,
	hopMs: 2.5,
	lagMs: 5,
	maxFilterBands: 3,
	preMaxMs: 20,
	postMaxMs: 10,
	preAvgMs: 50,
	postAvgMs: 10,
	delta: 3.5,
	minGapMs: MIN_ATTACK_GAP_MS,
	mergeMs: ATTACK_MERGE_MS,
	minRms: 0.002,
	strengthFloor: 40
};
