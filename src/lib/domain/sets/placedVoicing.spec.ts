import { describe, expect, it } from 'vitest';
import { parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { placedVoicingSet, type VoicingFigureItem } from './placedVoicing';

const D = 'D|maj|3:5,2:1,1:3';

describe('placedVoicingSet', () => {
	it('keys an item by its voicing and the frets of its place: the id of a placed shape', () => {
		expect(placedVoicingSet.itemKey({ voicing: D, frets: [2, 3, 2] })).toBe(`${D}@2-3-2`);
		const place = voicingOccurrences(parseVoicingKey(D))[1];
		expect(placedVoicingSet.itemKey({ voicing: D, frets: [14, 15, 14] })).toBe(occurrenceId(place));
	});

	it('keeps the length of a turn out of the key', () => {
		expect(placedVoicingSet.itemKey({ voicing: D, frets: [2, 3, 2], beats: 4 })).toBe(`${D}@2-3-2`);
		expect(placedVoicingSet.cardItem?.({ voicing: D, frets: [2, 3, 2], beats: 4 })).toEqual({
			voicing: D,
			frets: [2, 3, 2]
		});
	});

	it('parses a key back', () => {
		const items: VoicingFigureItem[] = [
			{ voicing: D, frets: [2, 3, 2] },
			{ voicing: D, frets: [14, 15, 14] },
			{ voicing: 'F#|m7|5:1,4:5', frets: [9, 11] }
		];
		for (const item of items) {
			expect(placedVoicingSet.parseItem(placedVoicingSet.itemKey(item))).toEqual(item);
		}
	});

	it('refuses frets where the voicing has no place, naming them', () => {
		expect(() => placedVoicingSet.parseItem(`${D}@9-9-9`)).toThrow(
			'the voicing has no place at frets 9-9-9'
		);
	});

	it('throws on a corrupted key, a rank or a length included', () => {
		for (const key of [
			'',
			D,
			`${D}@`,
			`${D}@x`,
			`${D}@0`,
			`${D}@2-3`,
			`${D}@2-3-2@4`,
			`${D}@0@4`,
			'@2-3-2',
			'nonsense@2-3-2'
		]) {
			expect(() => placedVoicingSet.parseItem(key), key).toThrow();
		}
	});
});
