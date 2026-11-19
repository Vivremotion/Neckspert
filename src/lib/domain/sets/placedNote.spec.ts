import { describe, expect, it } from 'vitest';
import { placedNoteSet } from './placedNote';

describe('placedNoteSet', () => {
	it('keys its items', () => {
		expect(placedNoteSet.itemKey({ string: 6, fret: 3 })).toBe('6:3');
		expect(placedNoteSet.parseItem('6:3')).toEqual({ string: 6, fret: 3 });
		expect(() => placedNoteSet.parseItem('6:12')).toThrow();
	});
});
