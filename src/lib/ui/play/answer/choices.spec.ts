import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';
import { identifyChoices, orderChoices } from './choices';

describe('identifyChoices', () => {
	it('lists the twelve pitches from C to B, altered notes with both spellings', () => {
		expect(identifyChoices()).toEqual([
			{ value: 'C', label: 'C' },
			{ value: 'C#', label: 'C# / Db' },
			{ value: 'D', label: 'D' },
			{ value: 'D#', label: 'D# / Eb' },
			{ value: 'E', label: 'E' },
			{ value: 'F', label: 'F' },
			{ value: 'F#', label: 'F# / Gb' },
			{ value: 'G', label: 'G' },
			{ value: 'G#', label: 'G# / Ab' },
			{ value: 'A', label: 'A' },
			{ value: 'A#', label: 'A# / Bb' },
			{ value: 'B', label: 'B' }
		]);
	});
});

describe('orderChoices', () => {
	it('sorts choices from C to B without mutating the input', () => {
		const shuffled = [...identifyChoices()].reverse();
		const before = [...shuffled];
		expect(orderChoices(shuffled).map((choice) => choice.value)).toEqual([...CHROMATIC_NOTES]);
		expect(shuffled).toEqual(before);
	});
});
