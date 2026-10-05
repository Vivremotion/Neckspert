import { isSuccess, type Attempt } from '$lib/domain/types';
import type { ExerciseDefinition, Progression } from './types';

/** Tempo of a first execution when nothing else says otherwise. */
export const DEFAULT_TEMPO_BPM = 80;

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

/** Prompts (probes left out) a session needs before it moves the tempo. To calibrate. */
export const TEMPO_MIN_PROMPTS = 10;

export function clampTempo(bpm: number): number {
	return Math.min(TEMPO_MAX_BPM, Math.max(TEMPO_MIN_BPM, Math.round(bpm)));
}

/**
 * Tempo of a first or next execution: the exercise's own progression, else its own start tempo,
 * else the latest progression of the same mechanic, else the default. Always within range.
 */
export function startTempo(
	definition: ExerciseDefinition,
	progressions: readonly Progression[]
): number {
	const own = progressions.find((p) => p.exerciseId === definition.id);
	if (own) return clampTempo(own.tempoBpm);
	if (definition.startTempoBpm !== undefined) return clampTempo(definition.startTempoBpm);
	const sameMechanic = progressions
		.filter((p) => p.mechanic === definition.mechanic)
		.reduce<Progression | null>(
			(latest, p) => (!latest || p.updatedAt > latest.updatedAt ? p : latest),
			null
		);
	return clampTempo(sameMechanic ? sameMechanic.tempoBpm : DEFAULT_TEMPO_BPM);
}

/**
 * Tempo of the next execution of an exercise, from this one's success (probes left out). The
 * caller passes the attempts of one exercise. The tempo never changes during an execution. A
 * tempo set outside the range is never pushed the wrong way by the bound.
 */
export function nextTempo(
	tempoBpm: number,
	attempts: readonly Pick<Attempt, 'phase' | 'correct' | 'verdict'>[]
): number {
	const counted = attempts.filter((attempt) => attempt.phase !== 'probe');
	if (counted.length < TEMPO_MIN_PROMPTS) return tempoBpm;
	const rate = counted.filter(isSuccess).length / counted.length;
	const step = rate > TEMPO_RAISE_AT ? TEMPO_STEP_BPM : rate < TEMPO_LOWER_AT ? -TEMPO_STEP_BPM : 0;
	if (step === 0) return tempoBpm;
	const next = clampTempo(tempoBpm + step);
	return Math.sign(next - tempoBpm) === Math.sign(step) ? next : tempoBpm;
}
