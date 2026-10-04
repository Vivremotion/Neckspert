import type { Attempt } from '$lib/domain/types';
import { successRate } from './success';

/**
 * Slowest tempo. At 80 bpm the 2-beat lead lasts 1 500 ms = RECALL_THRESHOLD_MS: the shortest
 * step stays a test of direct recall.
 */
export const TEMPO_MIN_BPM = 80;
export const TEMPO_MAX_BPM = 160;

/** Change between two learn sessions. To calibrate. */
export const TEMPO_STEP_BPM = 5;

/** Session success above which the next one is faster. To calibrate. */
export const TEMPO_RAISE_AT = 0.9;

/** Session success under which the next one is slower. To calibrate. */
export const TEMPO_LOWER_AT = 0.7;

/** Mode 1 prompts (probes left out) a session needs before it moves the tempo. To calibrate. */
export const TEMPO_MIN_PROMPTS = 10;

export function clampTempo(bpm: number): number {
	return Math.min(TEMPO_MAX_BPM, Math.max(TEMPO_MIN_BPM, Math.round(bpm)));
}

/**
 * Tempo of the next learn session, from this one's mode 1 success (probes left out). The
 * tempo never changes during a session. A tempo set outside the range is never pushed the
 * wrong way by the bound.
 */
export function nextSessionTempo(currentBpm: number, attempts: readonly Attempt[]): number {
	const counted = attempts.filter(
		(attempt) => attempt.target.direction === 'locate' && attempt.phase !== 'probe'
	);
	if (counted.length < TEMPO_MIN_PROMPTS) return currentBpm;
	const rate = successRate(counted) ?? 0;
	const step = rate > TEMPO_RAISE_AT ? TEMPO_STEP_BPM : rate < TEMPO_LOWER_AT ? -TEMPO_STEP_BPM : 0;
	if (step === 0) return currentBpm;
	const next = clampTempo(currentBpm + step);
	return Math.sign(next - currentBpm) === Math.sign(step) ? next : currentBpm;
}
