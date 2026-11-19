import { describe, expect, it } from 'vitest';
import { parseVoicingKey } from './voicing';
import { voicingNotes } from './voicingNotes';

describe('voicingNotes', () => {
	const cFirstInversion = parseVoicingKey('C|maj|3:3,2:5,1:1');

	it('gives the notes of a voicing at the place of its frets, lowest string first', () => {
		expect(voicingNotes(cFirstInversion, [9, 8, 8])).toEqual([
			{ midi: 64, string: 3, fret: 9 },
			{ midi: 67, string: 2, fret: 8 },
			{ midi: 72, string: 1, fret: 8 }
		]);
	});

	it('gives each place of the neck by its frets', () => {
		const cRootPosition = parseVoicingKey('C|maj|3:5,2:1,1:3');
		expect(voicingNotes(cRootPosition, [0, 1, 0]).map((n) => n.midi)).toEqual([55, 60, 64]);
		expect(voicingNotes(cRootPosition, [12, 13, 12])).toEqual([
			{ midi: 67, string: 3, fret: 12 },
			{ midi: 72, string: 2, fret: 13 },
			{ midi: 76, string: 1, fret: 12 }
		]);
	});

	it('throws when the voicing has no place at these frets, naming them', () => {
		// The next place of this shape would be at frets 21-20-20, past MAX_VOICING_FRET.
		expect(() => voicingNotes(cFirstInversion, [21, 20, 20])).toThrow(
			'the voicing has no place at frets 21-20-20'
		);
		expect(() => voicingNotes(cFirstInversion, [9, 8])).toThrow(RangeError);
	});

	it('reads open strings as fret 0', () => {
		const openC = parseVoicingKey('C|maj|5:1,4:3,3:5,2:1,1:3');
		expect(voicingNotes(openC, [3, 2, 0, 1, 0]).map((n) => n.fret)).toEqual([3, 2, 0, 1, 0]);
	});
});
