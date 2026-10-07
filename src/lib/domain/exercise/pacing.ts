import { RESPIRATION_BARS } from '$lib/domain/timing/grid';
import { LEARN_SUCCESSES } from '$lib/domain/progress/constants';
import { LEAD_STEPS } from '$lib/domain/types';
import type { ExerciseDefinition, ExercisePacing } from './types';

/** The rhythm of the notes exercises: the constants they always had. */
export const DEFAULT_PACING: ExercisePacing = {
	leadSteps: LEAD_STEPS,
	respirationBars: RESPIRATION_BARS,
	learnedAfter: LEARN_SUCCESSES
};

/** The pacing an exercise defines in its params, else the default. */
export function pacingOf(definition: ExerciseDefinition): ExercisePacing {
	const pacing = definition.params.pacing as ExercisePacing | undefined;
	return pacing ?? DEFAULT_PACING;
}
