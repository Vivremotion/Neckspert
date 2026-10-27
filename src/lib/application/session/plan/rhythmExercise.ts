import {
	eligibleFigures,
	resolvedParamsOf,
	type ExerciseDefinition,
	type LevelOverrides
} from '$lib/domain/exercise';
import {
	checkStart,
	Fraction,
	type Accompaniment,
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
	cyclesPerBreath: true,
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
 * Landing (spec section 6): a cycle starts at the first muted bar of the accompaniment, so the 1
 * where the click comes back is judged in the same cycle as the silence. The clicked bars before
 * it are the entry. 0 when no bar is muted.
 */
export function landingBar(accompaniment: Accompaniment): number {
	return Math.max(0, accompaniment.bars.indexOf('off'));
}

/**
 * The accompaniment with its bar 0 on transport bar `from`: the transport reads the on/off
 * cycle from its own bar 0, a run starts wherever the count ended. Its figure is left as it
 * is, so an accompaniment figure longer than a bar stays on the transport's grid.
 */
export function accompanimentFrom(accompaniment: Accompaniment, from: number): Accompaniment {
	const { bars } = accompaniment;
	const n = bars.length;
	return {
		figure: accompaniment.figure,
		bars: bars.map((_, i) => bars[(((i - from) % n) + n) % n])
	};
}

/** The accompaniment with no muted bar: the listen-in is heard, never silent. */
export function unmuted(accompaniment: Accompaniment): Accompaniment {
	return { figure: accompaniment.figure, bars: ['on'] };
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
