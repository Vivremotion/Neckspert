import { describe, expect, it } from 'vitest';
import { cardKeyOf, mechanicRules, MECHANIC_RULES } from './index';
import { voicingFigureRules, type VoicingFigureItem } from './voicingFigure';

const C = 'C|maj|3:3,2:5,1:1';

describe('voicingFigureRules', () => {
	it('is a skill, registered among the mechanics', () => {
		expect(voicingFigureRules).toMatchObject({ id: 'voicing-figure', learner: 'skill' });
		expect(mechanicRules('voicing-figure')).toBe(voicingFigureRules);
		expect(MECHANIC_RULES).toContain(voicingFigureRules);
	});

	it('keys an item by its voicing and its place, then its length when it has one', () => {
		expect(voicingFigureRules.itemKey({ voicing: C, occurrence: 1 })).toBe(`${C}@1`);
		expect(voicingFigureRules.itemKey({ voicing: C, occurrence: 0, beats: 4 })).toBe(`${C}@0@4`);
		expect(cardKeyOf(voicingFigureRules, { voicing: C, occurrence: 0 })).toBe(
			`voicing-figure:${C}@0`
		);
	});

	it('parses a key back, with and without beats', () => {
		const items: VoicingFigureItem[] = [
			{ voicing: C, occurrence: 0 },
			{ voicing: C, occurrence: 2, beats: 4 },
			{ voicing: 'F#|m7|5:1,4:5', occurrence: 1, beats: 2 }
		];
		for (const item of items) {
			expect(voicingFigureRules.parseItem(voicingFigureRules.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a corrupted key', () => {
		for (const key of [
			'',
			C,
			`${C}@`,
			`${C}@x`,
			`${C}@1.5`,
			`${C}@-1`,
			`${C}@0@0`,
			`${C}@0@x`,
			`${C}@0@4@1`,
			'@0',
			'nonsense@0'
		]) {
			expect(() => voicingFigureRules.parseItem(key), key).toThrow();
		}
	});
});
