import { describe, expect, it } from 'vitest';
import { figureSet, type FigureItem } from './figure';

describe('figureSet', () => {
	it('keys an item by its figure and its level', () => {
		const item: FigureItem = { figureId: 'offbeats-2', level: 3 };
		expect(figureSet.itemKey(item)).toBe('offbeats-2@3');
	});

	it('parses a key back, the negative levels of keys stored before issue #19 included', () => {
		for (const item of [
			{ figureId: 'offbeats-2', level: 3 },
			{ figureId: 'eighths', level: 0 },
			{ figureId: 'eighths', level: -1 }
		]) {
			expect(figureSet.parseItem(figureSet.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a key that is not a figure at a level', () => {
		for (const key of ['', 'eighths', '@2', 'eighths@', 'eighths@1.5', 'eighths@x']) {
			expect(() => figureSet.parseItem(key), key).toThrow();
		}
	});
});
