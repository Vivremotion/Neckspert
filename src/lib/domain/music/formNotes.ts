import { fretOf } from './fretboard';
import { formatSpelledNote, parseSpelledNote, spelledLike } from './spelling';

/**
 * A form moved so that its first note is `first`: every note by the same interval, on its own
 * string, with the fret that gives it, and spelled from its place in the form (the third of a
 * chord on E flat is a G, its seventh a D flat). Throws when a note falls off the neck.
 */
export function movedForm(
	notes: readonly { midi: number; string: number; name: string }[],
	first: { midi: number; name: string }
): { midi: number; string: number; fret: number; name: string }[] {
	if (notes.length === 0) throw new RangeError('A form has at least one note');
	const interval = first.midi - notes[0].midi;
	const root = parseSpelledNote(notes[0].name);
	const to = parseSpelledNote(first.name);
	return notes.map(({ midi, string, name }, k) => {
		const moved = midi + interval;
		const place = fretOf(moved, string);
		if ('problem' in place) {
			throw new RangeError(`The form moved to ${first.midi}: note ${k} ${place.problem}`);
		}
		const spelled = spelledLike(parseSpelledNote(name), root, to, moved);
		return { midi: moved, string, fret: place.fret, name: formatSpelledNote(spelled) };
	});
}
