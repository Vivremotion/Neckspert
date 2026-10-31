import { describe, expect, it } from 'vitest';
import { cardKeyOf, mechanicRules, MECHANIC_RULES } from './index';
import { figureRules, type FigureItem } from './figure';

describe('figureRules', () => {
	it('is a skill, registered among the mechanics', () => {
		expect(figureRules).toMatchObject({ id: 'figure', learner: 'skill' });
		expect(mechanicRules('figure')).toBe(figureRules);
		expect(MECHANIC_RULES).toContain(figureRules);
	});

	it('keys an item by its figure and its level', () => {
		const item: FigureItem = { figureId: 'offbeats-2', level: 3 };
		expect(figureRules.itemKey(item)).toBe('offbeats-2@3');
		expect(cardKeyOf(figureRules, item)).toBe('figure:offbeats-2@3');
	});

	it('parses a key back, negative aid levels included', () => {
		for (const item of [
			{ figureId: 'offbeats-2', level: 3 },
			{ figureId: 'eighths', level: 0 },
			{ figureId: 'eighths', level: -1 }
		]) {
			expect(figureRules.parseItem(figureRules.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a key that is not a figure at a level', () => {
		for (const key of ['', 'eighths', '@2', 'eighths@', 'eighths@1.5', 'eighths@x']) {
			expect(() => figureRules.parseItem(key), key).toThrow();
		}
	});
});
