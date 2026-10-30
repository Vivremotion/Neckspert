import { describe, expect, it } from 'vitest';
import { movedForm } from './formNotes';

/** `c\5 e\4 g\4 b\3`: two notes on the D string. */
const FORM = [
	{ midi: 48, string: 5, name: 'C' },
	{ midi: 52, string: 4, name: 'E' },
	{ midi: 55, string: 4, name: 'G' },
	{ midi: 59, string: 3, name: 'B' }
];

/** The first note `name`, at `midi`. */
const at = (midi: number, name = 'C') => ({ midi, name });

describe('movedForm', () => {
	it('moves every note by one interval, strings kept, and tells its frets', () => {
		expect(movedForm(FORM, at(50, 'D'))).toEqual([
			{ midi: 50, string: 5, fret: 5, name: 'D' },
			{ midi: 54, string: 4, fret: 4, name: 'F#' },
			{ midi: 57, string: 4, fret: 7, name: 'A' },
			{ midi: 61, string: 3, fret: 6, name: 'C#' }
		]);
	});

	it('spells each note from its place in the form: a flat chord in flats', () => {
		// E flat major seventh: E flat, G, B flat, D, never D sharp and A sharp.
		expect(movedForm(FORM, at(51, 'Eb')).map((n) => n.name)).toEqual(['Eb', 'G', 'Bb', 'D']);
		// A diminished seventh written `b d f as`, moved to C sharp: its seventh a B flat.
		const dim7 = [
			{ midi: 47, string: 5, name: 'B' },
			{ midi: 50, string: 5, name: 'D' },
			{ midi: 53, string: 4, name: 'F' },
			{ midi: 56, string: 4, name: 'Ab' }
		];
		expect(movedForm(dim7, at(49, 'C#')).map((n) => n.name)).toEqual(['C#', 'E', 'G', 'Bb']);
	});

	it('moves down as well as up, and leaves a form on its own first note where it is', () => {
		expect(movedForm(FORM, at(48)).map((n) => n.fret)).toEqual([3, 2, 5, 4]);
		// Its second note then on the open string.
		expect(movedForm(FORM, at(46)).map((n) => n.fret)).toEqual([1, 0, 3, 2]);
	});

	it('throws when a note falls below its open string', () => {
		expect(() => movedForm(FORM, at(43))).toThrow(/moved to 43: note 0 .*below string 5/);
	});

	it('throws when a note falls above the last fret, naming that note', () => {
		// Its third note, two frets above the first, reaches fret 24 from a first note at fret 22.
		expect(movedForm(FORM, at(67)).map((n) => n.fret)).toEqual([22, 21, 24, 23]);
		expect(() => movedForm(FORM, at(68))).toThrow(
			/moved to 68: note 2 .*above the last fret of string 4/
		);
	});
});
