import { GESTURE_EXERCISES } from '$lib/domain/gesture/exercises';
import { RHYTHM_EXERCISES } from './rhythmCatalog';
import { LEARN_SUCCESSES } from '$lib/domain/progress/constants';
import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import type { ExerciseDefinition, ExerciseId, Ladder } from './types';

/**
 * Leads on the beat, at 80 bpm: 8 beats with the answer shown, then 4, then 2 (1 500 ms, the
 * recall threshold), where only a direct recall counts and `LEARN_SUCCESSES` learn the item.
 */
function leadsLadder(): Ladder {
	return [
		{ params: { leadBeats: 8, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
		{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 }, drop: { failures: 1 } },
		{
			params: { leadBeats: 2, aided: false },
			pass: { successes: LEARN_SUCCESSES },
			drop: { failures: 1 },
			success: 'direct-recall'
		}
	];
}

/** In free time: the answer shown, then unaided, where only a direct recall counts. */
function freeTimeLadder(): Ladder {
	return [
		{ params: { leadBeats: null, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
		{
			params: { leadBeats: null, aided: false },
			pass: { successes: LEARN_SUCCESSES },
			drop: { failures: 1 },
			success: 'direct-recall'
		}
	];
}

export const LOCATE_NECK: ExerciseDefinition = {
	id: 'locate-neck',
	version: 1,
	mechanic: 'locate',
	view: 'note-lane',
	tempo: { fixed: 80 },
	params: { recallThresholdMs: RECALL_THRESHOLD_MS, ladder: leadsLadder() }
};

export const IDENTIFY_NECK: ExerciseDefinition = {
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	view: 'answer-keys',
	params: { recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS, ladder: freeTimeLadder() }
};

/** The triads of the memory track: close major and minor triads on G-B-E, then D-G-B. */
function triadsParams() {
	return {
		stringSets: [
			[3, 2, 1],
			[4, 3, 2]
		],
		qualities: ['maj', 'min'],
		pacing: { respirationBars: 1 },
		recallThresholdMs: RECALL_THRESHOLD_MS,
		ladder: leadsLadder()
	};
}

/** Find a triad from its root on a named string (spec 2026-10-08, section 1). */
export const TRIADS_ANCHOR: ExerciseDefinition = {
	id: 'triads-anchor',
	version: 1,
	mechanic: 'triad-anchor',
	tempo: { fixed: 80 },
	params: triadsParams()
};

/** Find a triad in a named position. */
export const TRIADS_ZONE: ExerciseDefinition = {
	id: 'triads-zone',
	version: 1,
	mechanic: 'triad-zone',
	tempo: { fixed: 80 },
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
