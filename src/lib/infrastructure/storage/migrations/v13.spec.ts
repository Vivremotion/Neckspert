import { describe, expect, it } from 'vitest';
import { MECHANIC_RULES } from '$lib/domain/mechanics';
import { allExercises } from '$lib/domain/exercise/registry';
import {
	MECHANICS_V12,
	SKILL_OF_EXERCISE_V12,
	SKILL_OF_MECHANIC_V13,
	attemptToV13,
	backupV8ToV9,
	cardToV13
} from './v13';
import type { BackupV8 } from './v12';
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

describe('a card at version 13', () => {
	it('names the skill of its mechanic, its key prefixed by it', () => {
		const before = {
			key: 'locate:6:F',
			mechanic: 'locate',
			item: { string: 6, pitch: 'F' },
			learnedAt: 5
		};
		expect(cardToV13(before)).toEqual({
			key: 'locate-note-string:6:F',
			skill: 'locate-note-string',
			item: { string: 6, pitch: 'F' },
			learnedAt: 5
		});
		expect(cardToV13({ key: 'identify:5:8', mechanic: 'identify' })).toEqual({
			key: 'identify-note:5:8',
			skill: 'identify-note'
		});
		expect(cardToV13({ key: 'triad-zone:D|maj|3:5,2:1,1:3', mechanic: 'triad-zone' })).toEqual({
			key: 'chord-zone:D|maj|3:5,2:1,1:3',
			skill: 'chord-zone'
		});
	});

	it('keeps a card of a mechanic it does not know: its mechanic as its skill, its key', () => {
		expect(cardToV13({ key: 'kazoo:1', mechanic: 'kazoo', item: 1 })).toEqual({
			key: 'kazoo:1',
			skill: 'kazoo',
			item: 1
		});
	});

	it('does not change the row it is given', () => {
		const row = { key: 'locate:6:F', mechanic: 'locate' };
		cardToV13(row);
		expect(row).toEqual({ key: 'locate:6:F', mechanic: 'locate' });
	});
});

describe('an attempt at version 13', () => {
	it('names the skill of its exercise, its card key prefixed by it', () => {
		const before = {
			id: 4,
			exerciseId: 'gesture-climb',
			mechanic: 'chord-grid',
			cardKey: 'chord-grid:climb:iohefy-a:3,2,1#2',
			success: true
		};
		expect(attemptToV13(before)).toEqual({
			id: 4,
			exerciseId: 'gesture-climb',
			skill: 'grid-in-direction',
			cardKey: 'grid-in-direction:climb:iohefy-a:3,2,1#2',
			success: true
		});
	});

	it('of an exercise the catalog did not hold: its exercise id as its skill', () => {
		expect(
			attemptToV13({ exerciseId: 'my-own', mechanic: 'figure', cardKey: 'figure:a@0' })
		).toEqual({ exerciseId: 'my-own', skill: 'my-own', cardKey: 'my-own:a@0' });
	});
});

describe('a backup at version 9', () => {
	it('is the version 8 backup with its cards and attempts upgraded', () => {
		const backup = {
			app: 'neckspert-play',
			version: 8,
			cards: [{ key: 'locate:6:F', mechanic: 'locate' }],
			attempts: [{ exerciseId: 'locate-neck', mechanic: 'locate', cardKey: 'locate:6:F' }],
			sessions: []
		} as unknown as BackupV8;
		expect(backupV8ToV9(backup)).toEqual({
			app: 'neckspert-play',
			version: 9,
			cards: [{ key: 'locate-note-string:6:F', skill: 'locate-note-string' }],
			attempts: [
				{
					exerciseId: 'locate-neck',
					skill: 'locate-note-string',
					cardKey: 'locate-note-string:6:F'
				}
			],
			sessions: []
		});
	});
});

describe('the frozen skills of version 13', () => {
	it('give each catalog exercise the skill it practises', () => {
		expect(Object.fromEntries(allExercises().map((e) => [e.id, e.practices]))).toEqual(
			SKILL_OF_EXERCISE_V12
		);
	});

	it('give each memory mechanic the skill of its exercises', () => {
		expect(SKILL_OF_MECHANIC_V13).toEqual({
			locate: SKILL_OF_EXERCISE_V12['locate-neck'],
			identify: SKILL_OF_EXERCISE_V12['identify-neck'],
			'triad-anchor': SKILL_OF_EXERCISE_V12['triads-anchor'],
			'triad-zone': SKILL_OF_EXERCISE_V12['triads-zone']
		});
	});
});
