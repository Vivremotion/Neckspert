/**
 * The four exercises of the changes as the catalog writes them, with their passages, and what
 * the specs of the passages read of them: the link's chords, the groups of strings, the zones.
 */
import type { ExerciseDefinition } from '$lib/domain/exercise';
import {
	GESTURE_CLIMB,
	GESTURE_EXERCISES,
	GESTURE_JAM,
	GESTURE_LINK,
	GESTURE_ZONE
} from './catalog';

export const LINK_PASSAGES = GESTURE_LINK;
export const CLIMB_PASSAGES = GESTURE_CLIMB;
export const ZONE_PASSAGES = GESTURE_ZONE;
export const JAM_PASSAGES = GESTURE_JAM;

/** The four exercises of the changes, in the order of the ladder. */
export const CHANGES_EXERCISES: readonly ExerciseDefinition[] = GESTURE_EXERCISES;
export const PASSAGE_EXERCISES = CHANGES_EXERCISES;

/** The link's 24 chords: each root of a chord chart, major then minor (`C`, `Cm`, `C#`, `C#m`…). */
export const LINK_CHORDS = GESTURE_LINK.passages!.of.chord as readonly string[];

/** The two groups of strings the link and the climb play on. */
export const STRING_GROUPS = GESTURE_LINK.passages!.of.strings as readonly (readonly number[])[];

/** The thirteen zones of five frets of `grid-in-zone`, in their order (D7). */
export const ZONES = GESTURE_ZONE.passages!.each!.zone as readonly (readonly [number, number])[];

/** A grid as a file writes it, of `count` changes: C and F in turn, a bar each. */
export function alternatingGrid(id: string, count: number) {
	return {
		id,
		title: id,
		beatsPerBar: 4,
		bars: count,
		chords: Array.from({ length: count }, (_, i) => ({
			bar: i + 1,
			beat: 1,
			symbol: i % 2 === 0 ? 'C' : 'F'
		}))
	};
}
