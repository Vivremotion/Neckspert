import { describe, expect, it } from 'vitest';
import { identifyChoices } from './choices';
import { keyboardKeys } from './keyboard';

describe('keyboardKeys', () => {
	it('lays one octave like a piano', () => {
		const keys = keyboardKeys(identifyChoices());
		const whites = keys.filter((key) => key.color === 'white');
		expect(whites.map((key) => [key.choice.value, key.whiteIndex])).toEqual([
			['C', 0],
			['D', 1],
			['E', 2],
			['F', 3],
			['G', 4],
			['A', 5],
			['B', 6]
		]);
		const blacks = keys.filter((key) => key.color === 'black');
		expect(blacks.map((key) => [key.choice.value, key.whiteIndex])).toEqual([
			['C#', 0],
			['D#', 1],
			['F#', 3],
			['G#', 4],
			['A#', 5]
		]);
	});

	it('ignores the order the choices came in', () => {
		const keys = keyboardKeys([...identifyChoices()].reverse());
		expect(keys.map((key) => key.choice.value)).toEqual(identifyChoices().map((c) => c.value));
	});
});
