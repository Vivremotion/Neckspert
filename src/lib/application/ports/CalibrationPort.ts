export interface CalibrationProgress {
	hits: number;
	needed: number;
	lastOffsetMs: number | null;
}

export type CalibrationOutcome =
	| { ok: true; offsetMs: number; spreadMs: number }
	| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' };

/** Measures detection latency by having the guitarist play on a click. */
export interface CalibrationPort {
	run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome>;
	cancel(): void;
}
