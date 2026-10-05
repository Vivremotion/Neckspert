import { describe, expect, it } from 'vitest';
import { pitchOnString } from './fretboard';
import { LEARNABLE_FRETS, locateItems, practiceCards } from './curriculum';
import { locateItemKey, neckCardKey } from './items';

describe('LEARNABLE_FRETS', () => {
	it('runs from fret 1 to 11: open strings are assumed known', () => {
		expect(LEARNABLE_FRETS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	});
});

describe('locateItems', () => {
	it('returns 66 locate items, string 6 first, frets 1 to 11 on each string', () => {
		const items = locateItems();
		expect(items).toHaveLength(66);
		expect(new Set(items.map(locateItemKey)).size).toBe(66);
		expect(items[0]).toEqual({ string: 6, pitch: 'F' });
		expect(items[11]).toEqual({ string: 5, pitch: 'A#' });
		expect(items[65]).toEqual({ string: 1, pitch: 'D#' });
	});

	it('leaves out every open-string pitch on its own string', () => {
		for (const string of [6, 5, 4, 3, 2, 1] as const) {
			const open = pitchOnString(string, 0);
			expect(locateItems().some((item) => item.string === string && item.pitch === open)).toBe(
				false
			);
		}
	});
});

describe('practiceCards', () => {
	it('returns the 66 locate and 66 identify cards of frets 1 to 11', () => {
		const cards = practiceCards();
		expect(cards).toHaveLength(132);
		expect(new Set(cards.map(neckCardKey)).size).toBe(132);
		expect(cards.filter((card) => card.mechanic === 'identify')).toHaveLength(66);
		expect(cards.some((card) => card.mechanic === 'identify' && card.item.fret === 0)).toBe(false);
	});
});
