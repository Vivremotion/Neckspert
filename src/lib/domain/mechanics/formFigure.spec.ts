import { describe, expect, it } from 'vitest';
import { cardKeyOf, mechanicRules, MECHANIC_RULES } from './index';
import { formFigureRules, formNamed, type FormFigureItem } from './formFigure';

describe('formFigureRules', () => {
	it('is a skill, registered among the mechanics', () => {
		expect(formFigureRules).toMatchObject({ id: 'form-figure', learner: 'skill' });
		expect(mechanicRules('form-figure')).toBe(formFigureRules);
		expect(MECHANIC_RULES).toContain(formFigureRules);
	});

	it('keys an item by its form and its first note, then its length when it has one', () => {
		expect(formFigureRules.itemKey({ form: 'maj7', first: 'bes' })).toBe('maj7@bes');
		expect(formFigureRules.itemKey({ form: 'maj7', first: 'bes', beats: 2 })).toBe('maj7@bes@2');
		expect(cardKeyOf(formFigureRules, { form: 'maj7', first: 'g,' })).toBe('form-figure:maj7@g,');
	});

	it('parses a key back, with and without beats', () => {
		const items: FormFigureItem[] = [
			{ form: 'maj7', first: 'd' },
			{ form: 'maj7', first: 'g,' },
			{ form: 'maj7', first: "bes'", beats: 2 },
			{ form: 'm7-on-6', first: 'fis', beats: 4 }
		];
		for (const item of items) {
			expect(formFigureRules.parseItem(formFigureRules.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a corrupted key', () => {
		for (const key of [
			'',
			'maj7',
			'maj7@',
			'@d',
			'maj7@h',
			'maj7@d4',
			'maj7@d\\5',
			'maj7@r',
			'maj7@d e',
			"maj7@d',",
			'maj7@d@0',
			'maj7@d@x',
			'maj7@d@4@1'
		]) {
			expect(() => formFigureRules.parseItem(key), key).toThrow();
		}
	});
});

describe('formNamed', () => {
	const form = { id: 'maj7', symbol: 'maj7', notes: [{ midi: 48, string: 5, name: 'C' }] };

	it('finds a form by its id', () => {
		expect(formNamed([form], 'maj7')).toBe(form);
	});

	it('throws naming the form and the forms written', () => {
		expect(() => formNamed([form], 'm7')).toThrow(
			'names form "m7", which the exercise does not write (maj7)'
		);
		expect(() => formNamed(undefined, 'm7')).toThrow(
			'names form "m7", which the exercise does not write (none)'
		);
	});
});
