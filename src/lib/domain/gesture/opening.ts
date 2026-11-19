import { CHORD_ANCHOR_SKILL_ID, CHORD_ZONE_SKILL_ID } from '$lib/domain/exercise/catalogIds';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { parseTriadId } from '$lib/domain/sets/chordGrid';
import {
	closeTriadVoicings,
	pitchOfSpelled,
	voicingKey,
	type Chord,
	type StringNumber
} from '$lib/domain/music';
import { cardKey, type CardState } from '$lib/domain/types';
import { gestureElements, type GestureElement } from './exercises';

type TriadSkill = typeof CHORD_ANCHOR_SKILL_ID | typeof CHORD_ZONE_SKILL_ID;

/** The triads a grid plays, once each (Eb and D# alike). */
function gridTriads(gridId: string): Chord[] {
	const symbols = new Set(gridChanges(gridById(gridId)).map((change) => change.symbol));
	const byPitch = new Map(
		[...symbols]
			.map(triadOf)
			.map((chord) => [`${pitchOfSpelled(chord.root)}|${chord.quality.id}`, chord])
	);
	return [...byPitch.values()];
}

/** The three inversions of `chord` on `set` are acquired in `skill`. */
function acquired(
	acquiredKeys: ReadonlySet<string>,
	skill: TriadSkill,
	chord: Chord,
	set: readonly StringNumber[]
): boolean {
	return closeTriadVoicings(chord, set).every((voicing) =>
		acquiredKeys.has(cardKey(skill, voicingKey(voicing)))
	);
}

/**
 * The element is open (spec 2026-10-10, section 5), "acquired" meaning a card acquired:
 * link, the three inversions of its chord on its set in anchor; climb, every inversion of every
 * triad of its grid on its set in anchor; zone, on both sets in the zone; jam, every triad's
 * inversions in anchor on one set at least.
 */
function isOpen(element: GestureElement, acquiredKeys: ReadonlySet<string>): boolean {
	const has = (skill: TriadSkill, chord: Chord, set: readonly StringNumber[]) =>
		acquired(acquiredKeys, skill, chord, set);
	if (element.rule === 'link') {
		return has(CHORD_ANCHOR_SKILL_ID, parseTriadId(element.chord ?? ''), element.sets[0]);
	}
	const triads = gridTriads(element.gridId ?? '');
	switch (element.rule) {
		case 'climb':
			return triads.every((chord) => has(CHORD_ANCHOR_SKILL_ID, chord, element.sets[0]));
		case 'zone':
			return triads.every((chord) =>
				element.sets.every((set) => has(CHORD_ZONE_SKILL_ID, chord, set))
			);
		case 'jam':
			return triads.every((chord) =>
				element.sets.some((set) => has(CHORD_ANCHOR_SKILL_ID, chord, set))
			);
	}
}

/** The open elements of a gesture exercise, in the order of its content. */
export function openElements(
	definition: ExerciseDefinition,
	cards: readonly CardState[]
): GestureElement[] {
	const acquiredKeys = new Set(
		cards.filter((card) => card.acquiredAt !== null).map((card) => card.key)
	);
	return gestureElements(definition).filter((element) => isOpen(element, acquiredKeys));
}

/** A gesture exercise is open when one of its elements is. */
export function gestureOpen(definition: ExerciseDefinition, cards: readonly CardState[]): boolean {
	return openElements(definition, cards).length > 0;
}
