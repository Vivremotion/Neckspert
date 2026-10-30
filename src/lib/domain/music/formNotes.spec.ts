import { describe, expect, it } from 'vitest';
import { movedForm } from './formNotes';

/** `c\5 e\4 g\4 b\3`: two notes on the D string. */
const FORM = [
	{ midi: 48, string: 5 },
	{ midi: 52, string: 4 },
	{ midi: 55, string: 4 },
	{ midi: 59, string: 3 }
];

describe('movedForm', () => {
	it('moves every note by one interval, strings kept, and tells its frets', () => {
		expect(movedForm(FORM, 50)).toEqual([
			{ midi: 50, string: 5, fret: 5 },
			{ midi: 54, string: 4, fret: 4 },
			{ midi: 57, string: 4, fret: 7 },
			{ midi: 61, string: 3, fret: 6 }
		]);
	});

	it('moves down as well as up, and leaves a form on its own first note where it is', () => {
		expect(movedForm(FORM, 48).map((n) => n.fret)).toEqual([3, 2, 5, 4]);
		// Its second note then on the open string.
		expect(movedForm(FORM, 46).map((n) => n.fret)).toEqual([1, 0, 3, 2]);
	});

	it('throws when a note falls below its open string', () => {
		expect(() => movedForm(FORM, 43)).toThrow(/moved to 43: note 0 .*below string 5/);
	});

	it('throws when a note falls above the last fret, naming that note', () => {
		// Its third note, two frets above the first, reaches fret 24 from a first note at fret 22.
		expect(movedForm(FORM, 67).map((n) => n.fret)).toEqual([22, 21, 24, 23]);
		expect(() => movedForm(FORM, 68)).toThrow(
			/moved to 68: note 2 .*above the last fret of string 4/
		);
	});
});
