import type { Attempt } from '$lib/domain/types';
import type { ExerciseDefinition, Progression } from './types';

/**
 * How an exercise sets its tempo: fixed, or a range it moves within from one learn session to
 * the next (its own step and thresholds). Data of the exercise.
 */
export type ExerciseTempo =
	| { fixed: number }
	| {
			start: number;
			min: number;
			max: number;
			step: number;
			/** Session success above which the next one is faster. */
			raiseAt: number;
			/** Session success under which the next one is slower. */
			lowerAt: number;
			/** Prompts (probes left out) a session needs before it moves the tempo. */
			minPrompts: number;
	  };

/**
 * The range of an exercise that gives none: starts at 80 bpm, 80 to 160, moves 5 bpm above 90 %
 * or under 70 % of success after ten prompts. At 80 bpm the 2-beat lead lasts 1 500 ms, the
 * recall threshold. To calibrate.
 */
export const DEFAULT_TEMPO: Extract<ExerciseTempo, { start: number }> = {
	start: 80,
	min: 80,
	max: 160,
	step: 5,
	raiseAt: 0.9,
	lowerAt: 0.7,
	minPrompts: 10
};

/** Tempo of a first execution when nothing else says otherwise. */
export const DEFAULT_TEMPO_BPM = DEFAULT_TEMPO.start;

/** The exercise's tempo data, `DEFAULT_TEMPO` when absent (`startTempoBpm` then sets its start). */
export function exerciseTempoOf(definition: ExerciseDefinition): ExerciseTempo {
	if (definition.tempo) return definition.tempo;
	return definition.startTempoBpm === undefined
		? DEFAULT_TEMPO
		: { ...DEFAULT_TEMPO, start: definition.startTempoBpm };
}

/** Bounds a tempo by the exercise's range (its fixed tempo, when it has one); no rounding. */
export function clampTempo(definition: ExerciseDefinition, bpm: number): number {
	const tempo = exerciseTempoOf(definition);
	if ('fixed' in tempo) return tempo.fixed;
	return Math.min(tempo.max, Math.max(tempo.min, bpm));
}

/** The progression belongs to this exercise and this scope (none: the exercise's own). */
export function isProgressionOf(
	progression: Pick<Progression, 'exerciseId' | 'scope'>,
	exerciseId: string,
	scope?: string
): boolean {
	return progression.exerciseId === exerciseId && (progression.scope ?? null) === (scope ?? null);
}

/**
 * Tempo of a first or next execution: the exercise's own progression (in `scope`, when given),
 * else its own start tempo, else the latest progression of the same mechanic, else the default.
 * A new scope never starts at another scope's tempo: the definition's start tempo comes first.
 * Always within range; a fixed tempo is that tempo.
 */
export function startTempo(
	definition: ExerciseDefinition,
	progressions: readonly Progression[],
	scope?: string
): number {
	const tempo = exerciseTempoOf(definition);
	// A fixed tempo ignores what was stored.
	if ('fixed' in tempo) return tempo.fixed;
	const own = progressions.find((p) => isProgressionOf(p, definition.id, scope));
	if (own) return clampTempo(definition, own.tempoBpm);
	if (definition.tempo || definition.startTempoBpm !== undefined) {
		return clampTempo(definition, tempo.start);
	}
	const sameMechanic = progressions
		// In a scope, never another scope of the same exercise (another grid's tempo).
		.filter(
			(p) =>
				p.mechanic === definition.mechanic &&
				(scope === undefined || p.exerciseId !== definition.id)
		)
		.reduce<Progression | null>(
			(latest, p) => (!latest || p.updatedAt > latest.updatedAt ? p : latest),
			null
		);
	return clampTempo(definition, sameMechanic ? sameMechanic.tempoBpm : tempo.start);
}

/**
 * Tempo of the next execution of an exercise, from this one's success (probes left out). The
 * caller passes the attempts of one exercise. The tempo never changes during an execution, and
 * a fixed tempo never changes. A tempo set outside the range is never pushed the wrong way by
 * the bound.
 */
export function nextTempo(
	definition: ExerciseDefinition,
	tempoBpm: number,
	attempts: readonly Pick<Attempt, 'phase' | 'success'>[]
): number {
	const tempo = exerciseTempoOf(definition);
	if ('fixed' in tempo) return tempoBpm;
	const counted = attempts.filter((attempt) => attempt.phase !== 'probe');
	if (counted.length < tempo.minPrompts) return tempoBpm;
	const rate = counted.filter((attempt) => attempt.success).length / counted.length;
	const step = rate > tempo.raiseAt ? tempo.step : rate < tempo.lowerAt ? -tempo.step : 0;
	if (step === 0) return tempoBpm;
	const next = clampTempo(definition, tempoBpm + step);
	return Math.sign(next - tempoBpm) === Math.sign(step) ? next : tempoBpm;
}
