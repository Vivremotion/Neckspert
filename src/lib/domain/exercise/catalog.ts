import { GESTURE_EXERCISES } from '$lib/domain/gesture/exercises';
import { RHYTHM_EXERCISES } from './rhythmCatalog';
import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import type { ExerciseDefinition, ExerciseId } from './types';

export const LOCATE_NECK: ExerciseDefinition = {
	id: 'locate-neck',
	version: 1,
	mechanic: 'locate',
	params: { recallThresholdMs: RECALL_THRESHOLD_MS }
};

export const IDENTIFY_NECK: ExerciseDefinition = {
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	params: { recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS }
};

/** The triads of the memory track: close major and minor triads on G-B-E, then D-G-B. */
function triadsParams() {
	return {
		stringSets: [
			[3, 2, 1],
			[4, 3, 2]
		],
		qualities: ['maj', 'min'],
		pacing: { leadSteps: [8, 4, 2], respirationBars: 1, learnedAfter: 2 },
		recallThresholdMs: RECALL_THRESHOLD_MS
	};
}

/** Find a triad from its root on a named string (spec 2026-10-08, section 1). */
export const TRIADS_ANCHOR: ExerciseDefinition = {
	id: 'triads-anchor',
	version: 1,
	mechanic: 'triad-anchor',
	params: triadsParams()
};

/** Find a triad in a named position. */
export const TRIADS_ZONE: ExerciseDefinition = {
	id: 'triads-zone',
	version: 1,
	mechanic: 'triad-zone',
	params: triadsParams()
};

export const EXERCISES: readonly ExerciseDefinition[] = [
	LOCATE_NECK,
	IDENTIFY_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	...GESTURE_EXERCISES,
	...RHYTHM_EXERCISES
];

export function exerciseById(id: ExerciseId): ExerciseDefinition {
	const found = EXERCISES.find((exercise) => exercise.id === id);
	if (!found) throw new Error(`Unknown exercise: ${id}`);
	return found;
}
