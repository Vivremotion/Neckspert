import type { StringNumber } from './types';
import { voicingOccurrences, type Voicing } from './voicing';

/**
 * The notes of `voicing` at its `occurrence`-th place on the neck (0: the lowest), lowest string
 * first, each with its exact pitch. Throws when it has no such place.
 */
export function voicingNotes(
	voicing: Voicing,
	occurrence: number
): { midi: number; string: StringNumber; fret: number }[] {
	const places = voicingOccurrences(voicing);
	if (!Number.isInteger(occurrence) || occurrence < 0 || occurrence >= places.length) {
		throw new RangeError(
			`Occurrence ${occurrence} does not exist: the voicing has ${places.length} places`
		);
	}
	return places[occurrence].notes.map(({ midi, string, fret }) => ({ midi, string, fret }));
}
