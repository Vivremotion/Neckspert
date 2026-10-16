import type { SensorLatency } from '$lib/domain/types';

/**
 * `listen`: clicks on the output, the player silent; `compare`: the player plays notes freely,
 * heard by two inputs (or two sensors of one); `play`: the fallback, the player on the click.
 */
export type CalibrationPhase = 'listen' | 'compare' | 'play';

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
	run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome>;
	cancel(): void;
}
