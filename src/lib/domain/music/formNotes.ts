import { fretOf } from './fretboard';

/**
 * A form moved so that its first note is `firstMidi`: every note by the same interval, on its own
 * string, with the fret that gives it. Throws when a note falls off the neck.
 */
export function movedForm(
	notes: readonly { midi: number; string: number }[],
	firstMidi: number
): { midi: number; string: number; fret: number }[] {
	if (notes.length === 0) throw new RangeError('A form has at least one note');
	const interval = firstMidi - notes[0].midi;
	return notes.map(({ midi, string }, k) => {
		const moved = midi + interval;
		const place = fretOf(moved, string);
		if ('problem' in place) {
			throw new RangeError(`The form moved to ${firstMidi}: note ${k} ${place.problem}`);
		}
		return { midi: moved, string, fret: place.fret };
	});
}
