import { describe, expect, it } from 'vitest';
import { MECHANIC_RULES } from '$lib/domain/mechanics';
import { MECHANICS_V12 } from './v13';
import source from './v13.ts?raw';

const EXAMPLES: Record<string, string> = {
	locate: '6:F',
	identify: '5:8',
	'triad-anchor': 'D|maj|3:5,2:1,1:3',
	'triad-zone': 'D|maj|3:5,2:1,1:3',
	'chord-grid': 'climb:iohefy-a:3,2,1#2',
	figure: 'silent-bars@2',
	'voicing-figure': 'D|maj|3:5,2:1,1:3@0@4',
	'form-figure': 'maj7@d@4'
};

function frozen(id: string) {
	const found = MECHANICS_V12.find((mechanic) => mechanic.id === id);
	if (!found) throw new Error(`no frozen mechanic ${id}`);
	return found;
}

describe('the mechanics as version 12 knew them', () => {
	it('lists the eight, in order, with which had cards', () => {
		expect(MECHANICS_V12.map((m) => [m.id, m.cards])).toEqual([
			['locate', true],
			['identify', true],
			['triad-anchor', true],
			['triad-zone', true],
			['chord-grid', false],
			['figure', false],
			['voicing-figure', false],
			['form-figure', false]
		]);
	});

	it.each(Object.entries(EXAMPLES))('%s: a key reads and writes back', (id, key) => {
		const mechanic = frozen(id);
		expect(mechanic.itemKey(mechanic.parseItem(key))).toBe(key);
	});

	it.each(Object.keys(EXAMPLES))('%s: refuses a key that is not its own', (id) => {
		expect(() => frozen(id).parseItem('???')).toThrow();
	});

	it('keeps the part of a prompted item its card keeps', () => {
		expect(frozen('triad-zone').cardItem?.({ voicingKey: 'k', position: 3 })).toEqual({
			voicingKey: 'k'
		});
		expect(frozen('chord-grid').cardItem?.({ element: 'e', index: 1, symbol: 'x' })).toEqual({
			element: 'e',
			index: 1
		});
	});

	// Temporary: it goes with the live mechanics.
	it.each(Object.entries(EXAMPLES))(
		'%s: equals the live mechanic (until the live mechanics go)',
		(id, key) => {
			const live = MECHANIC_RULES.find((rules) => rules.id === id)!;
			const old = frozen(id);
			expect(old.parseItem(key)).toEqual(live.parseItem(key));
			expect(old.itemKey(old.parseItem(key))).toBe(live.itemKey(live.parseItem(key)));
			expect(old.cards).toBe(live.learner === 'memory');
		}
	);

	it('imports nothing from the live mechanics', () => {
		expect(source).not.toMatch(/from '\$lib\/(domain|application)\/mechanics/);
	});
});
