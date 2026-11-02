import { formatSpelledNote } from './spelling';
import type { StringNumber } from './types';
import { voicingOccurrences, type Voicing } from './voicing';

/**
 * The notes of `voicing` at its place on the neck where its notes take `frets` (in its strings'
 * order), lowest string first, each with its exact pitch and its name as the chord spells it.
 * Throws when it has no place there.
 */
export function voicingNotes(
	voicing: Voicing,
	frets: readonly number[]
): { midi: number; string: StringNumber; fret: number; name: string }[] {
	const written = frets.join('-');
	const place = voicingOccurrences(voicing).find(
		(occurrence) => occurrence.notes.map((note) => note.fret).join('-') === written
	);
	if (!place) throw new RangeError(`the voicing has no place at frets ${written}`);
	return place.notes.map(({ midi, string, fret, note }) => ({
		midi,
		string,
		fret,
		name: formatSpelledNote(note)
	}));
}
