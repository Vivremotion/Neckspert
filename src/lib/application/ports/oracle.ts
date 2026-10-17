import type { CyclePlanRecord } from '$lib/application/session/plan/recordCycle';
import type { CycleReport, CycleVerdict } from '$lib/domain/time';

/**
 * The oracle of the attack sensor as the screens see it (spec 2026-10-14, section 11): the
 * runs exported, and the report of their annotation. Built by `infrastructure/diagnostics`.
 */

/** A run cut out for the oracle, as `suites.json` keeps it: all that the comparison needs. */
export interface OracleSuite {
	/** "suite-01": its WAV and its labels are named after it. */
	name: string;
	sessionId: string;
	takeId: string;
	attemptIds: number[];
	/** Audio time of the slice's first sample. */
	sliceStartAudioS: number;
	sampleRate: number;
	/** The attacks the sensor heard, s from the slice start, before latency correction. */
	detected: number[];
	/** Each cycle as played: its plan, its start (s from the slice start), its latency and verdict. */
	cycles: {
		attemptId: number;
		plan: CyclePlanRecord;
		startS: number;
		latency: CycleReport['latency'];
		verdict: CycleVerdict;
	}[];
}

/** What the sensor heard against the truth: pairs, misses, false attacks, and the timing. */
export interface SensorComparison {
	matched: number;
	/** Real attacks the sensor did not hear. */
	missed: number;
	/** Attacks the sensor heard that were not played. */
	falseAttacks: number;
	/** Mean of detected − truth over the pairs (ms); null without a pair. */
	biasMs: number | null;
	/** Their standard deviation (ms); null without a pair. */
	spreadMs: number | null;
}

export interface OracleReport {
	suites: {
		name: string;
		sensor: SensorComparison;
		/** The cycles whose verdict the truth changes. */
		changed: { attemptId: number; before: CycleVerdict; after: CycleVerdict }[];
	}[];
	total: SensorComparison;
	/** Label files that match no suite. */
	unmatched: string[];
}
