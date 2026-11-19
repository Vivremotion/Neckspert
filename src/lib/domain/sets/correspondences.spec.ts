import { describe, expect, it } from 'vitest';
import { pitchOnString } from '$lib/domain/music';
import { CORRESPONDENCE_NAMES, correspondence } from './correspondences';

describe('correspondences between item sets', () => {
	it('names its correspondences', () => {
		expect([...CORRESPONDENCE_NAMES]).toEqual(['same', 'same-place', 'voicing']);
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

	it('maps a placed voicing to its voicing on its strings', () => {
		const voicing = correspondence('voicing', 'placed-voicing', 'voicing-on-strings');
		expect(voicing?.of({ voicing: 'C|maj|3:1,2:3,1:5', frets: [5, 5, 3] })).toEqual({
			voicingKey: 'C|maj|3:1,2:3,1:5'
		});
		expect(correspondence('voicing', 'voicing-on-strings', 'placed-voicing')).toBeNull();
		expect(correspondence('voicing', 'placed-note', 'voicing-on-strings')).toBeNull();
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
