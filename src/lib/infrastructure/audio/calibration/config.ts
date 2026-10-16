import type { AttackConfig } from '../attacks/config';

/** The fallback calibration, the player on the click. */
export interface CalibrationConfig {
	bpm: number;
	hitsNeeded: number;
	maxSpreadMs: number;
	/** Clicks of the fallback; with no hit by the last one, nothing was heard. */
	noSoundBeats: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
	bpm: 80,
	hitsNeeded: 10,
	maxSpreadMs: 40,
	noSoundBeats: 32
};

/** Audio seconds after `clock.now()` before the first click (must be ≥ 0.1). */
export const CALIBRATION_START_DELAY_S = 0.5;

/**
 * The attack tracker of the reference mic (the computer's, opened beside an interface). The
 * default `delta` (3.5) hears nothing of an app click under about −25 dBFS at the tracker,
 * about −43 dBFS at the raw built-in mic (gain 8): clicks from monitors a metre away can stay
 * under it. At 2 the click is heard down to about −30 dBFS, timed as well (well under 1 ms of
 * its onset); the real built-in mic takes then give some 3 to 5 false attacks a second, which
 * the listen phase's cluster and the compare phase's pairing leave out.
 */
export const REFERENCE_ATTACK_CONFIG: Partial<AttackConfig> = { delta: 2 };

/** Clicks of the listen phase, the player silent. */
export const BLEED_CHECK_CLICKS = 8;
/** At least this share of the clicks heard by the playing input: it hears the click (bleed). */
export const CLICK_BLEED_RATIO = 0.2;
/** Notes played freely in the compare phase, heard by both inputs. */
export const CALIBRATION_ATTACKS = 16;

/**
 * How long after a click an input may hear it, in seconds. Wide: output and input latency
 * add up, and Firefox's are large.
 */
export const LISTEN_WINDOW_S = 0.5;
/**
 * A reference input must hear at least this share of the clicks, at one common delay (within
 * `PAIR_WINDOW_S` of the mode), for its loop latency to count.
 */
export const LISTEN_MIN_HEARD_RATIO = 0.5;
/**
 * Largest spread (median absolute deviation) of the delays of the clicks heard, in ms: a click
 * scheduled on the audio clock comes back at a steady delay.
 */
export const LISTEN_MAX_SPREAD_MS = 5;
/** Two readings of one attack pair within this distance of their constant offset, in seconds. */
export const PAIR_WINDOW_S = 0.03;
/** The share of the anchor's attacks that must pair for a delay to count. */
export const MIN_PAIRED_SHARE = 0.75;
/** Notes that must find their attack for the note detector's delay to count. */
export const NOTE_DELAY_MIN_PAIRS = 8;
/** Interface attacks that must find their mic reading. */
export const COMPARE_MIN_PAIRS = Math.ceil(MIN_PAIRED_SHARE * CALIBRATION_ATTACKS);
/**
 * Largest spread (median absolute deviation) of the interface − mic delays, in ms. The hardware
 * trial gave 2 to 5 ms.
 */
export const COMPARE_MAX_SPREAD_MS = 8;
/** Once the last attack is played, its late readings (the slower input) still arrive this long. */
export const COMPARE_SETTLE_S = 0.5;
/** The compare phase gives up after this long, in seconds. */
export const COMPARE_TIMEOUT_S = 90;
/**
 * The sound's travel from the strings to the computer's mic (about 1 ms per 34 cm), in ms. Not
 * asked: neglected under 50 cm.
 */
export const MIC_DISTANCE_MS = 0;
/**
 * On the click, a note counts only this close to a click, in ms: a note on the offbeat
 * (half a beat, 375 ms at ♩ = 80 bpm) is not a latency.
 */
export const PLAY_MAX_OFFSET_MS = 150;
/** The first bar on the click is ignored: the player finds the click. */
export const PLAY_SKIPPED_CLICKS = 4;
