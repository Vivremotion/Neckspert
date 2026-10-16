import type { SensorLatency } from '$lib/domain/types';

/**
 * `listen`: clicks on the output, the player silent; `bleed`: clicks again, headphones back on,
 * to tell whether the computer's mic, as the playing input, hears the click; `compare`: the
 * player plays notes freely, heard by two inputs (or two sensors of one); `play`: the fallback,
 * the player on the click.
 */
export type CalibrationPhase = 'listen' | 'bleed' | 'compare' | 'play';

export interface CalibrationProgress {
	phase: CalibrationPhase;
	done: number;
	needed: number;
}

export type CalibrationOutcome =
	| { ok: true; latency: Record<string, SensorLatency>; clickBleed: boolean }
	| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' | 'second-input' };

/**
 * Measures the latency of each sensor of the playing input: without the player when the
 * computer's mic can serve as a reference (provenance `system`), on the player's attacks on a
 * click otherwise (`player`). Also says whether the playing input hears the click.
 */
export interface CalibrationPort {
	/** Calibrates the input `deviceId` (null = the default device). */
	run(
		deviceId: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome>;
	cancel(): void;
}
