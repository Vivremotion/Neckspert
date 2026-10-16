import type { SensorLatency } from '$lib/domain/types';

/**
 * `listen`: clicks on the output, the player silent; `bleed`: clicks again, headphones back on,
 * to tell whether the computer's mic, as the playing input, hears the click; `compare`: the
 * player plays notes freely, no click, heard by two inputs (or two sensors of one); `play`: the
 * calibration on the click, chosen by the player, which measures the player too.
 */
export type CalibrationPhase = 'listen' | 'bleed' | 'compare' | 'play';

export interface CalibrationProgress {
	phase: CalibrationPhase;
	done: number;
	needed: number;
}

/** The numbers behind a latency, shown to the player. Times in ms. */
export interface CalibrationMeasure {
	/** The reference mic's own delay on the clicks (R); null on the click. */
	referenceMs: number | null;
	referenceSpreadMs: number | null;
	/** t_interface − t_mic on the same attacks; null when there is no second input. */
	offsetMs: number | null;
	/** Readings paired (or hits on the click), out of the notes played. */
	pairs: number;
	played: number;
	/** Spread (median absolute deviation) of the paired delays, or of the hits. */
	spreadMs: number | null;
	/** The latency of the attacks it gives; null when it gives none. */
	latencyMs: number | null;
}

/** Why the reference mic could not be calibrated on the clicks. */
export interface ReferenceDetail {
	/** Label of the computer mic used as the reference; null when none was found. */
	mic: string | null;
	opened: boolean;
	/** Clicks heard at one common delay, out of `clicks`. */
	heard: number;
	clicks: number;
	/** That common delay and its spread, when any click was heard. */
	delayMs: number | null;
	spreadMs: number | null;
}

export type CalibrationOutcome =
	| {
			ok: true;
			latency: Record<string, SensorLatency>;
			/** Null when it was not checked (on the click). */
			clickBleed: boolean | null;
			measure: CalibrationMeasure;
	  }
	| { ok: false; reason: 'reference'; detail: ReferenceDetail }
	| { ok: false; reason: 'inconsistent'; measure?: CalibrationMeasure }
	| { ok: false; reason: 'no-sound' | 'cancelled' | 'second-input' };

/**
 * Measures the latency of each sensor of the playing input without the player (provenance
 * `system`): the computer's mic, calibrated on clicks, is the reference. When the reference
 * fails, the run says why; the calibration on the click (`player`) is the player's own choice.
 */
export interface CalibrationPort {
	/** Calibrates the input `deviceId` (null = the default device) against the computer mic. */
	run(
		deviceId: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome>;
	/** The player on the click: it measures the player's timing too, shown, never judged. */
	runOnClick(
		deviceId: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome>;
	cancel(): void;
}
