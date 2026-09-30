import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';
import { identifyChoices, orderChoices } from './choices';

describe('identifyChoices', () => {
	it('lists the twelve pitches from C to B, altered notes with both spellings', () => {
		expect(identifyChoices()).toEqual([
			{ pitch: 'C', label: 'C' },
			{ pitch: 'C#', label: 'C# / Db' },
			{ pitch: 'D', label: 'D' },
			{ pitch: 'D#', label: 'D# / Eb' },
			{ pitch: 'E', label: 'E' },
			{ pitch: 'F', label: 'F' },
			{ pitch: 'F#', label: 'F# / Gb' },
			{ pitch: 'G', label: 'G' },
			{ pitch: 'G#', label: 'G# / Ab' },
			{ pitch: 'A', label: 'A' },
			{ pitch: 'A#', label: 'A# / Bb' },
			{ pitch: 'B', label: 'B' }
		]);
	});
});

describe('orderChoices', () => {
	it('sorts choices from C to B without mutating the input', () => {
		const shuffled = [...identifyChoices()].reverse();
		const before = [...shuffled];
		expect(orderChoices(shuffled).map((choice) => choice.pitch)).toEqual([...CHROMATIC_NOTES]);
		expect(shuffled).toEqual(before);
	});
});
