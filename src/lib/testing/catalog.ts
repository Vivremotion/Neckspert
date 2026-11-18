/**
 * The catalog's exercises and grids, read from the registries the test setup fills
 * (`testing/setup.ts`), for the specs that name them.
 */
import { exerciseById } from '$lib/domain/exercise/registry';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { gridById } from '$lib/domain/grid/registry';

export const LOCATE_NECK = exerciseById('locate-neck');
export const IDENTIFY_NECK = exerciseById('identify-neck');
export const TRIADS_ANCHOR = exerciseById('triads-anchor');
export const TRIADS_ZONE = exerciseById('triads-zone');

export const RHYTHM_SILENT_BARS = exerciseById('rhythm-silent-bars');
export const RHYTHM_TWO_FOUR = exerciseById('rhythm-two-four');
export const RHYTHM_OFFBEATS = exerciseById('rhythm-offbeats');
export const RHYTHM_EXERCISES: readonly ExerciseDefinition[] = [
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	RHYTHM_OFFBEATS
];

export const GESTURE_LINK = exerciseById('gesture-link');
export const GESTURE_CLIMB = exerciseById('gesture-climb');
export const GESTURE_ZONE = exerciseById('gesture-zone');
export const GESTURE_JAM = exerciseById('gesture-jam');
export const GESTURE_EXERCISES: readonly ExerciseDefinition[] = [
	GESTURE_LINK,
	GESTURE_CLIMB,
	GESTURE_ZONE,
	GESTURE_JAM
];

export const IOHEFY_A = gridById('iohefy-a');
export const BLUES_F = gridById('blues-f');
