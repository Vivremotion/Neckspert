import type { CycleThresholds } from '../time/judge/measures';
import type { Feedback } from '../time/levels';
import { resolvedParamsOf } from './levels';
import { isFigureEntry } from './round/types';
import type { ExerciseDefinition } from './types';

/**
 * What a round that plays a figure reads of its exercise level, beyond its template: how its
 * marks are told, what listening to the figure is worth, the cursor over it, and the thresholds
 * its verdict judges against. Absent from the params: the defaults below.
 */
export interface FigureParams {
	feedback: Feedback;
	listen: 'free' | 'aid' | 'none';
	cursor: boolean;
	thresholds: CycleThresholds;
}

const FEEDBACKS: readonly Feedback[] = ['every-cycle', 'summary', 'out-of-tolerance'];
const LISTENS: readonly FigureParams['listen'][] = ['free', 'aid', 'none'];

/** The figure params of an exercise that writes none. */
export const DEFAULT_FIGURE_PARAMS: FigureParams = {
	feedback: 'every-cycle',
	listen: 'none',
	cursor: false,
	thresholds: {}
};

/** The round template writes a figure entry. */
export function writesFigure(definition: ExerciseDefinition): boolean {
	return definition.round?.expectations.some(isFigureEntry) ?? false;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, otherwise: T): T {
	return values.includes(value as T) ? (value as T) : otherwise;
}

/**
 * The figure params of exercise level `exerciseLevel` (0 = level 1, aid levels negative), read in
 * its resolved params (`resolvedParamsOf`), each over its default. Throws on a level the exercise
 * does not have.
 */
export function figureParamsOf(
	definition: ExerciseDefinition,
	exerciseLevel: number
): FigureParams {
	const { feedback, listen, cursor, thresholds } = resolvedParamsOf(definition, {
		exerciseLevel,
		itemLevel: null
	});
	return {
		feedback: oneOf(FEEDBACKS, feedback, DEFAULT_FIGURE_PARAMS.feedback),
		listen: oneOf(LISTENS, listen, DEFAULT_FIGURE_PARAMS.listen),
		cursor: typeof cursor === 'boolean' ? cursor : DEFAULT_FIGURE_PARAMS.cursor,
		thresholds:
			typeof thresholds === 'object' && thresholds !== null
				? { ...(thresholds as CycleThresholds) }
				: { ...DEFAULT_FIGURE_PARAMS.thresholds }
	};
}
