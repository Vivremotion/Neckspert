import { eligibleFigures, type ExerciseDefinition } from '$lib/domain/exercise';
import {
	resolveLevel,
	type Accompaniment,
	type Figure,
	type Level,
	type LevelParams
} from '$lib/domain/time';

/** The base params and the levels of an exercise played cycle after cycle; throws without them. */
export function rhythmLevels(exercise: ExerciseDefinition): {
	base: LevelParams;
	levels: readonly Level[];
} {
	const { base, levels } = exercise;
	if (!base || !levels || levels.length === 0) {
		throw new Error(`Exercise ${exercise.id} has no levels to play`);
	}
	return { base, levels };
}

/** The params of level `index` (0 = level 1, aid levels negative) of an exercise. */
export function levelParamsOf(exercise: ExerciseDefinition, index: number): LevelParams {
	const { base, levels } = rhythmLevels(exercise);
	return resolveLevel(base, levels, index);
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
