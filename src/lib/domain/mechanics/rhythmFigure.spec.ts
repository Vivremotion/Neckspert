import { describe, expect, it } from 'vitest';
import { cardKeyOf, mechanicRules, MECHANIC_RULES } from './index';
import { rhythmFigureRules, type RhythmItem } from './rhythmFigure';

describe('rhythmFigureRules', () => {
	it('is a skill, registered among the mechanics', () => {
		expect(rhythmFigureRules).toMatchObject({ id: 'rhythm-figure', learner: 'skill' });
		expect(mechanicRules('rhythm-figure')).toBe(rhythmFigureRules);
		expect(MECHANIC_RULES).toContain(rhythmFigureRules);
	});

	it('keys an item by its figure and its level', () => {
		const item: RhythmItem = { figureId: 'offbeats-2', level: 3 };
		expect(rhythmFigureRules.itemKey(item)).toBe('offbeats-2@3');
		expect(cardKeyOf(rhythmFigureRules, item)).toBe('rhythm-figure:offbeats-2@3');
	});

	it('parses a key back, negative aid levels included', () => {
		for (const item of [
			{ figureId: 'offbeats-2', level: 3 },
			{ figureId: 'eighths', level: 0 },
			{ figureId: 'eighths', level: -1 }
		]) {
			expect(rhythmFigureRules.parseItem(rhythmFigureRules.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a key that is not a figure at a level', () => {
		for (const key of ['', 'eighths', '@2', 'eighths@', 'eighths@1.5', 'eighths@x']) {
			expect(() => rhythmFigureRules.parseItem(key), key).toThrow();
		}
	});
});
