import type { StringNumber } from './types';
import { voicingOccurrences, type Voicing } from './voicing';

/**
 * The notes of `voicing` at its place on the neck where its notes take `frets` (in its strings'
 * order), lowest string first, each with its exact pitch. Throws when it has no place there.
 */
export function voicingNotes(
	voicing: Voicing,
	frets: readonly number[]
): { midi: number; string: StringNumber; fret: number }[] {
	const written = frets.join('-');
	const place = voicingOccurrences(voicing).find(
		(occurrence) => occurrence.notes.map((note) => note.fret).join('-') === written
	);
	if (!place) throw new RangeError(`the voicing has no place at frets ${written}`);
	return place.notes.map(({ midi, string, fret }) => ({ midi, string, fret }));
}
