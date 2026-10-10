import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { parseTriadId } from '$lib/domain/mechanics/chordGrid';
import {
	closeTriadVoicings,
	pitchOfSpelled,
	voicingKey,
	type Chord,
	type StringNumber
} from '$lib/domain/music';
import { cardKey, type CardState } from '$lib/domain/types';
import { gestureElements, type GestureElement } from './exercises';

type TriadMechanic = 'triad-anchor' | 'triad-zone';

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

/** The three inversions of `chord` on `set` are acquired in `mechanic`. */
function acquired(
	acquiredKeys: ReadonlySet<string>,
	mechanic: TriadMechanic,
	chord: Chord,
	set: readonly StringNumber[]
): boolean {
	return closeTriadVoicings(chord, set).every((voicing) =>
		acquiredKeys.has(cardKey(mechanic, voicingKey(voicing)))
	);
}

/**
 * The element is open (spec 2026-10-10, section 5), "acquired" meaning a card acquired:
 * link, the three inversions of its chord on its set in anchor; climb, every inversion of every
 * triad of its grid on its set in anchor; zone, on both sets in the zone; jam, every triad's
 * inversions in anchor on one set at least.
 */
function isOpen(element: GestureElement, acquiredKeys: ReadonlySet<string>): boolean {
	const has = (mechanic: TriadMechanic, chord: Chord, set: readonly StringNumber[]) =>
		acquired(acquiredKeys, mechanic, chord, set);
	if (element.rule === 'link') {
		return has('triad-anchor', parseTriadId(element.chord ?? ''), element.sets[0]);
	}
	const triads = gridTriads(element.gridId ?? '');
	switch (element.rule) {
		case 'climb':
			return triads.every((chord) => has('triad-anchor', chord, element.sets[0]));
		case 'zone':
			return triads.every((chord) => element.sets.every((set) => has('triad-zone', chord, set)));
		case 'jam':
			return triads.every((chord) => element.sets.some((set) => has('triad-anchor', chord, set)));
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
