import type { ExerciseDefinition, ExercisePacing } from './types';

/** Bars after the target bar before the next prompt may appear. To calibrate. */
export const DEFAULT_RESPIRATION_BARS = 1;

/** The string of a prompt shows this many beats before its note, unless the exercise or its presenter says otherwise. To calibrate. */
export const DEFAULT_PREVIEW_BEATS = 1;

/** The rhythm of the notes exercises: the breathing bars they always had. */
export const DEFAULT_PACING: ExercisePacing = {
	respirationBars: DEFAULT_RESPIRATION_BARS
};

/** The pacing an exercise defines in its params, else the default. */
export function pacingOf(definition: ExerciseDefinition): ExercisePacing {
	const pacing = definition.params.pacing as ExercisePacing | undefined;
	return pacing ?? DEFAULT_PACING;
}

/**
 * Beats before a round's end that the next prompt is shown: the exercise's own
 * (`flow.previewBeats`), else its presenter's, else none (null). Resolved here alone.
 */
export function previewBeatsOf(
	definition: ExerciseDefinition,
	presenterDefault: number | undefined
): number | null {
	return definition.flow?.previewBeats ?? presenterDefault ?? null;
}
