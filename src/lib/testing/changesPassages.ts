/**
 * The four exercises of the changes as the catalog writes them, with their passages, and what
 * the specs of the passages read of them: the link's chords, the groups of strings, the zones.
 */
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { passageRound } from '$lib/domain/exercise/passage/round';
import { compileRound } from '$lib/domain/exercise/round';
import { passageDerivation } from '$lib/domain/families';
import { METER_4_4, type RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import {
	GESTURE_CLIMB,
	GESTURE_EXERCISES,
	GESTURE_JAM,
	GESTURE_LINK,
	GESTURE_ZONE,
	TRIADS_ANCHOR
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

/**
 * A round of a passage of `definition`, as the passage source serves it (the items of its
 * passage carried), `previous` heard before, and its plan compiled.
 */
export function servedPassageRound(
	definition: ExerciseDefinition,
	key: string,
	rank: number,
	each: Record<string, unknown> = {},
	previous: string | null = null
): { planned: PlannedItem; plan: RoundPlan } {
	const index = passageIndices(definition).find((found) => found.key === key)!;
	const derivation = passageDerivation(definition.passages!.members.family)!;
	const items = passageMembers(definition, index, each).map((member) => derivation.itemOf(member));
	const base = passageRound(definition, index, each, items[rank], rank, items.length);
	const planned = { ...base, passage: { ...base.passage, id: 's:0', previous, items } };
	const plan = compileRound(definition, planned, METER_4_4, {
		previewBeats: 0,
		fromRunStart: null
	});
	return { planned, plan };
}

/**
 * The triad anchor's round written again, its chord's content kept to frets 1 to 12: a note
 * first (the root), then a chord whose content offers fields; the presentation `presentation`.
 */
export function anchorWithZone(
	presentation: ExerciseDefinition['presentation']
): ExerciseDefinition {
	const round = TRIADS_ANCHOR.round!;
	const [root, chord] = round.expectations;
	return {
		...TRIADS_ANCHOR,
		presentation,
		round: {
			...round,
			expectations: [
				root,
				{
					...chord,
					content: { family: 'chord-shapes', where: [{ in: { frets: [1, 12] } }] }
				} as typeof chord
			]
		}
	};
}
