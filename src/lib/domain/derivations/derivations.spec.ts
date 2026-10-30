import { describe, expect, it } from 'vitest';
import { CONTENT_DERIVATIONS, ITEM_NUMBERS } from './index';

const C_FIRST = 'C|maj|3:3,2:5,1:1';

// D major on the G-B-E strings with the root on the B string.
const KEY = 'D|maj|3:5,2:1,1:3';

describe('the derivations', () => {
	it('derives the root of a voicing as a note on its string', () => {
		const root = CONTENT_DERIVATIONS['voicing-root'];
		expect(root.kind).toBe('note');
		expect(root.derive({ voicingKey: KEY })).toEqual({ string: 2, pitch: 'D' });
	});

	it('derives a voicing anywhere and at its position', () => {
		expect(
			CONTENT_DERIVATIONS['voicing-anywhere'].derive({ voicingKey: KEY, position: 7 })
		).toEqual({ voicingKey: KEY, position: null });
		expect(
			CONTENT_DERIVATIONS['voicing-at-position'].derive({ voicingKey: KEY, position: 7 })
		).toEqual({ voicingKey: KEY, position: 7 });
		expect(CONTENT_DERIVATIONS['voicing-at-position'].kind).toBe('chord-voicing');
		const item = { string: 3, pitch: 'F' };
		expect(CONTENT_DERIVATIONS['note-of-item'].derive(item)).toBe(item);
		expect(CONTENT_DERIVATIONS['name-of-item'].derive(item)).toBe(item);
		expect(CONTENT_DERIVATIONS['grid-change'].derive(item)).toBe(item);
		expect(
			ITEM_NUMBERS['change-beats'].measure({ changes: [{ length: 2 }, { length: 4 }], index: 1 })
		).toBe(4);
	});

	it('declares the mechanics each derivation reads', () => {
		const reads = Object.fromEntries(
			Object.entries(CONTENT_DERIVATIONS).map(([name, d]) => [name, d.reads])
		);
		expect(reads).toEqual({
			'note-of-item': ['locate'],
			'name-of-item': ['identify'],
			'voicing-root': ['triad-anchor', 'triad-zone'],
			'voicing-anywhere': ['triad-anchor', 'triad-zone'],
			'voicing-at-position': ['triad-zone'],
			'grid-change': ['chord-grid'],
			'voicing-notes': ['voicing-figure']
		});
		expect(ITEM_NUMBERS['change-beats'].reads).toEqual(['chord-grid']);
		expect(ITEM_NUMBERS.beats.reads).toEqual(['voicing-figure']);
	});

	it("voicing-notes derives the notes of the item's voicing", () => {
		const notes = CONTENT_DERIVATIONS['voicing-notes'];
		expect(notes.kind).toBe('pitch');
		expect(notes.list).toBe(true);
		expect(notes.derive({ voicing: C_FIRST, occurrence: 0 })).toEqual([
			{ midi: 64, string: 3 },
			{ midi: 67, string: 2 },
			{ midi: 72, string: 1 }
		]);
		expect(notes.derive({ voicing: 'C|maj|3:5,2:1,1:3', occurrence: 1, beats: 4 })).toEqual([
			{ midi: 67, string: 3 },
			{ midi: 72, string: 2 },
			{ midi: 76, string: 1 }
		]);
		expect(() => notes.derive({ voicing: C_FIRST, occurrence: 1 })).toThrow();
	});

	it('only voicing-notes spreads a list', () => {
		const lists = Object.entries(CONTENT_DERIVATIONS)
			.filter(([, d]) => d.list)
			.map(([name]) => name);
		expect(lists).toEqual(['voicing-notes']);
	});

	it("beats measures the item's own length and throws without one", () => {
		expect(ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, occurrence: 0, beats: 4 })).toBe(4);
		expect(() => ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, occurrence: 0 })).toThrow();
	});
});
