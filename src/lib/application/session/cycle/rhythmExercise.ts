import {
	eligibleFigures,
	resolvedParamsOf,
	type ExerciseDefinition,
	type LevelOverrides
} from '$lib/domain/exercise';
import {
	checkStart,
	Fraction,
	type Figure,
	type Level,
	type LevelParams,
	type TempoSegment
} from '$lib/domain/time';

/** The levels of an exercise played cycle after cycle; throws without them. */
export function rhythmLevels(exercise: ExerciseDefinition): readonly Level<LevelOverrides>[] {
	const { levels } = exercise;
	if (!levels || levels.length === 0) {
		throw new Error(`Exercise ${exercise.id} has no levels to play`);
	}
	return levels;
}

/** Every key of the rhythm's level params: what `rhythmParamsOf` reads of the resolved params. */
const LEVEL_PARAM_KEYS: Record<keyof LevelParams, true> = {
	accompaniment: true,
	cycleBars: true,
	tempo: true,
	window: true,
	feedback: true,
	listen: true,
	cursor: true,
	listenInBars: true,
	countIn: true,
	thresholds: true
};

/**
 * The params of level `level` (0 = level 1, aid levels negative) of an exercise played cycle after
 * cycle: its resolved params (`resolvedParamsOf`) read as the rhythm's; throws on a level it does
 * not have or a start the player could not use (`checkStart`).
 */
export function rhythmParamsOf(exercise: ExerciseDefinition, level: number): LevelParams {
	rhythmLevels(exercise);
	const resolved = resolvedParamsOf(exercise, { exerciseLevel: level, itemLevel: null });
	const params = Object.fromEntries(
		Object.keys(LEVEL_PARAM_KEYS)
			.filter((key) => resolved[key] !== undefined)
			.map((key) => [key, resolved[key]])
	) as unknown as LevelParams;
	checkStart(params);
	return params;
}

/** The tempo of level params as a segment from the start, its beat the accompaniment's unit. */
export function tempoSegmentOf(params: Pick<LevelParams, 'tempo' | 'accompaniment'>): TempoSegment {
	return { at: Fraction.ZERO, bpm: params.tempo, unit: params.accompaniment.figure.meter.unit };
}

/**
 * The figure of the `played`-th cycle (from 0) of a series at these params: always the same in
 * a loop, the next in turn otherwise. Throws when no figure of the exercise fits the cycle.
 */
export function figureFor(
	exercise: ExerciseDefinition,
	params: LevelParams,
	played: number
): { id: string; figure: Figure } {
	const figures = eligibleFigures(exercise, params);
	if (figures.length === 0) {
		throw new Error(`No figure of ${exercise.id} fits a cycle of ${params.cycleBars} bars`);
	}
	if (exercise.pick !== 'next') return figures[0];
	return figures[((played % figures.length) + figures.length) % figures.length];
}
