import { describe, expect, it } from 'vitest';
import { CONTENT_DERIVATIONS, ITEM_NUMBERS } from './index';

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
			'grid-change': ['chord-grid']
		});
		expect(ITEM_NUMBERS['change-beats'].reads).toEqual(['chord-grid']);
	});
});
