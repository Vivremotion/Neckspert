import { describe, expect, it } from 'vitest';
import { parseVoicingKey } from './voicing';
import { voicingNotes } from './voicingNotes';

describe('voicingNotes', () => {
	const cFirstInversion = parseVoicingKey('C|maj|3:3,2:5,1:1');

	it('gives the notes of the lowest place of a voicing, lowest string first', () => {
		expect(voicingNotes(cFirstInversion, 0)).toEqual([
			{ midi: 64, string: 3, fret: 9 },
			{ midi: 67, string: 2, fret: 8 },
			{ midi: 72, string: 1, fret: 8 }
		]);
	});

	it('gives the next place up the neck', () => {
		const cRootPosition = parseVoicingKey('C|maj|3:5,2:1,1:3');
		expect(voicingNotes(cRootPosition, 0).map((n) => n.fret)).toEqual([0, 1, 0]);
		expect(voicingNotes(cRootPosition, 1)).toEqual([
			{ midi: 67, string: 3, fret: 12 },
			{ midi: 72, string: 2, fret: 13 },
			{ midi: 76, string: 1, fret: 12 }
		]);
		expect(() => voicingNotes(cRootPosition, 2)).toThrow(RangeError);
	});

	it('throws when the voicing has no such place', () => {
		// The next place of this shape would be at frets 21-20-20, past MAX_VOICING_FRET.
		expect(() => voicingNotes(cFirstInversion, 1)).toThrow(RangeError);
		expect(() => voicingNotes(cFirstInversion, -1)).toThrow(RangeError);
		expect(() => voicingNotes(cFirstInversion, 0.5)).toThrow(RangeError);
	});

	it('reads open strings as fret 0', () => {
		const openC = parseVoicingKey('C|maj|5:1,4:3,3:5,2:1,1:3');
		expect(voicingNotes(openC, 0).map((n) => n.fret)).toEqual([3, 2, 0, 1, 0]);
	});
});
