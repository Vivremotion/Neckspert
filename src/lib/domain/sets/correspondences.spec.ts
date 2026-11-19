import { describe, expect, it } from 'vitest';
import { pitchOnString } from '$lib/domain/music';
import { CORRESPONDENCE_NAMES, correspondence } from './correspondences';

describe('correspondences between item sets', () => {
	it('names its correspondences', () => {
		expect([...CORRESPONDENCE_NAMES]).toEqual(['same', 'same-place']);
	});

	it('maps a placed note to the note on its string, by its place', () => {
		const samePlace = correspondence('same-place', 'placed-note', 'note-on-string');
		expect(samePlace).not.toBeNull();
		for (const [string, fret] of [
			[1, 5],
			[3, 7],
			[6, 12]
		] as const) {
			expect(samePlace?.of({ string, fret })).toEqual({
				string,
				pitch: pitchOnString(string, fret)
			});
		}
	});

	it('holds `same` between a set and itself, as the item itself', () => {
		const same = correspondence('same', 'note-on-string', 'note-on-string');
		const item = { string: 2, pitch: 'C' };
		expect(same?.of(item)).toBe(item);
	});

	it('holds `same` between no two different sets', () => {
		expect(correspondence('same', 'placed-note', 'note-on-string')).toBeNull();
	});

	it('knows no other name, nor same-place between other sets', () => {
		expect(correspondence('nope', 'placed-note', 'note-on-string')).toBeNull();
		expect(correspondence('same-place', 'note-on-string', 'placed-note')).toBeNull();
	});
});
