/**
 * The catalog's exercises and grids, read from the registries the test setup fills
 * (`testing/setup.ts`), for the specs that name them.
 */
import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import { exerciseById } from '$lib/domain/exercise/registry';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { gridById } from '$lib/domain/grid/registry';

export const LOCATE_NECK = exerciseById('locate-note-string');
export const IDENTIFY_NECK = exerciseById('identify-note');
export const TRIADS_ANCHOR = exerciseById('chord-anchor');
export const TRIADS_ZONE = exerciseById('chord-zone');
/** The voicing keys the anchor introduces, in the order its list writes them: C's three inversions first. */
export const TRIAD_ORDER: readonly string[] = (TRIADS_ANCHOR.items ?? []).map(itemEntryKey);

export const RHYTHM_SILENT_BARS = exerciseById('rhythm-silent-bars');
export const RHYTHM_TWO_FOUR = exerciseById('rhythm-two-four');
export const RHYTHM_OFFBEATS = exerciseById('rhythm-offbeats');
export const RHYTHM_EXERCISES: readonly ExerciseDefinition[] = [
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	RHYTHM_OFFBEATS
];

export const GESTURE_LINK = exerciseById('inversion-run');
export const GESTURE_CLIMB = exerciseById('grid-in-direction');
export const GESTURE_ZONE = exerciseById('grid-in-zone');
export const GESTURE_JAM = exerciseById('grid-reading');
export const GESTURE_EXERCISES: readonly ExerciseDefinition[] = [
	GESTURE_LINK,
	GESTURE_CLIMB,
	GESTURE_ZONE,
	GESTURE_JAM
];

export const IOHEFY_A = gridById('iohefy-a');
export const BLUES_F = gridById('blues-f');
