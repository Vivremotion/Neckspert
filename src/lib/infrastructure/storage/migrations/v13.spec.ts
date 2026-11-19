import { describe, expect, it } from 'vitest';
import { allExercises, exerciseById } from '$lib/domain/exercise/registry';
import {
	MECHANICS_V12,
	SKILL_OF_EXERCISE_V12,
	SKILL_OF_MECHANIC_V13,
	EXERCISE_IDS_V13,
	attemptToV13,
	backupV8ToV9,
	cardToV13,
	levelStateToV13,
	sessionToV13
} from './v13';
import type { BackupV8 } from './v12';
import source from './v13.ts?raw';
import { parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';

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

	it('imports nothing from the live sets', () => {
		expect(source).not.toMatch(/from '\$lib\/(domain|application)\/(mechanics|sets)/);
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
			exerciseId: 'grid-in-direction',
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

describe('the item keys of an attempt at version 13', () => {
	const D = 'D|maj|3:5,2:1,1:3';
	const upgraded = (mechanic: string, cardKey: string, data: unknown = { item: {} }) =>
		attemptToV13({ exerciseId: 'my-own', mechanic, cardKey, data }).cardKey;

	it('voicing-figure: the place of its rank, its length dropped', () => {
		expect(upgraded('voicing-figure', `voicing-figure:${D}@0@4`)).toBe(`my-own:${D}@2-3-2`);
		expect(upgraded('voicing-figure', `voicing-figure:${D}@1`)).toBe(`my-own:${D}@14-15-14`);
	});

	it('form-figure: its shape and first note, its length dropped', () => {
		expect(upgraded('form-figure', 'form-figure:maj7@d@4')).toBe('my-own:maj7@d');
		expect(upgraded('form-figure', "form-figure:maj7@bes'")).toBe("my-own:maj7@bes'");
	});

	it('chord-grid: the shape a link asked, else the grid and the rank of the change', () => {
		const shape = `${D}@2-3-2`;
		const link = { item: { rule: 'link', element: 'link:D|maj:3,2,1', index: 2, shape } };
		expect(
			attemptToV13({
				exerciseId: 'gesture-link',
				mechanic: 'chord-grid',
				cardKey: 'chord-grid:link:D|maj:3,2,1#2',
				data: link
			})
		).toMatchObject({
			exerciseId: 'inversion-run',
			skill: 'inversion-run',
			cardKey: `inversion-run:${shape}`,
			data: link
		});
		const climb = { item: { rule: 'climb', element: 'climb:iohefy-a:3,2,1', index: 2 } };
		expect(upgraded('chord-grid', 'chord-grid:climb:iohefy-a:3,2,1#2', climb)).toBe(
			'my-own:iohefy-a#2'
		);
		const zone = { item: { rule: 'zone', element: 'zone:iohefy-a', index: 0 } };
		expect(upgraded('chord-grid', 'chord-grid:zone:iohefy-a#0', zone)).toBe('my-own:iohefy-a#0');
	});

	it('keeps the rest of a key it cannot read under the new prefix', () => {
		// No such place, a key that does not parse.
		expect(upgraded('voicing-figure', `voicing-figure:${D}@9@4`)).toBe(`my-own:${D}@9@4`);
		expect(upgraded('voicing-figure', 'voicing-figure:nonsense@0')).toBe('my-own:nonsense@0');
		expect(upgraded('form-figure', 'form-figure:maj7')).toBe('my-own:maj7');
		// Missing or unexpected data.
		expect(upgraded('chord-grid', 'chord-grid:climb:x#1', undefined)).toBe('my-own:climb:x#1');
		expect(upgraded('chord-grid', 'chord-grid:climb:x#1', { item: 'x' })).toBe('my-own:climb:x#1');
		expect(
			upgraded('chord-grid', 'chord-grid:link:x#1', { item: { rule: 'link', element: 'link:x' } })
		).toBe('my-own:link:x#1');
		expect(
			upgraded('chord-grid', 'chord-grid:jam#1', {
				item: { rule: 'jam', element: 'jam', index: 1 }
			})
		).toBe('my-own:jam#1');
		expect(attemptToV13({ exerciseId: 'my-own', mechanic: 'voicing-figure' })).toEqual({
			exerciseId: 'my-own',
			skill: 'my-own',
			cardKey: undefined
		});
	});

	it('reads the places of a voicing live: the lowest first', () => {
		// A tripwire: a change of voicingOccurrences changes what version 13 makes of old keys.
		const places = (voicing: string) =>
			voicingOccurrences(parseVoicingKey(voicing)).map(occurrenceId);
		expect(places(D)[0]).toBe(`${D}@2-3-2`);
		expect(places('C|maj|3:1,2:3,1:5')[1]).toBe('C|maj|3:1,2:3,1:5@17-17-15');
		expect(places('G|maj|3:3,2:5,1:1')[1]).toBe('G|maj|3:3,2:5,1:1@16-15-15');
	});
});

describe('a backup at version 9', () => {
	it('is the version 8 backup with its cards, attempts, level states and sessions upgraded', () => {
		const backup = {
			app: 'neckspert-play',
			version: 8,
			cards: [{ key: 'locate:6:F', mechanic: 'locate' }],
			attempts: [{ exerciseId: 'locate-neck', mechanic: 'locate', cardKey: 'locate:6:F' }],
			levelStates: [{ exerciseId: 'locate-neck', scope: '', item: '6:F', level: 2 }],
			sessions: [{ id: 's', kind: 'learn', executions: [{ exerciseId: 'locate-neck' }] }]
		} as unknown as BackupV8;
		expect(backupV8ToV9(backup)).toEqual({
			app: 'neckspert-play',
			version: 9,
			cards: [{ key: 'locate-note-string:6:F', skill: 'locate-note-string' }],
			attempts: [
				{
					exerciseId: 'locate-note-string',
					skill: 'locate-note-string',
					cardKey: 'locate-note-string:6:F'
				}
			],
			levelStates: [{ exerciseId: 'locate-note-string', scope: '', item: '6:F', level: 2 }],
			sessions: [{ id: 's', routine: 'notes', executions: [{ exerciseId: 'locate-note-string' }] }]
		});
	});
});

describe('the exercise ids of version 13', () => {
	it('rename the eight exercises after their skill', () => {
		expect(EXERCISE_IDS_V13).toEqual({
			'locate-neck': 'locate-note-string',
			'identify-neck': 'identify-note',
			'triads-anchor': 'chord-anchor',
			'triads-zone': 'chord-zone',
			'gesture-link': 'inversion-run',
			'gesture-climb': 'grid-in-direction',
			'gesture-zone': 'grid-in-zone',
			'gesture-jam': 'grid-reading'
		});
	});

	it('name exercises of the catalog, each after the skill it practises', () => {
		for (const id of Object.values(EXERCISE_IDS_V13)) {
			expect(exerciseById(id).practices).toBe(id);
		}
		const ids = allExercises().map((e) => e.id);
		for (const old of Object.keys(EXERCISE_IDS_V13)) expect(ids).not.toContain(old);
	});

	it('rename the exercise of an attempt, its skill read from its old id', () => {
		expect(
			attemptToV13({ exerciseId: 'triads-zone', mechanic: 'triad-zone', cardKey: 'triad-zone:k' })
		).toEqual({ exerciseId: 'chord-zone', skill: 'chord-zone', cardKey: 'chord-zone:k' });
		expect(
			attemptToV13({ exerciseId: 'rhythm-offbeats', mechanic: 'figure', cardKey: 'figure:a@0' })
		).toEqual({
			exerciseId: 'rhythm-offbeats',
			skill: 'figure-independence',
			cardKey: 'figure-independence:a@0'
		});
	});
});

describe('a level state at version 13', () => {
	it('names its exercise by its new id, nothing else changed', () => {
		const before = { exerciseId: 'gesture-climb', scope: 'blues-f', item: '', level: 3 };
		expect(levelStateToV13(before)).toEqual({ ...before, exerciseId: 'grid-in-direction' });
		expect(before.exerciseId).toBe('gesture-climb');
	});

	it('keeps an id that was not renamed, and a row without one', () => {
		const rhythm = { exerciseId: 'rhythm-two-four', scope: '', item: '', level: 1 };
		expect(levelStateToV13(rhythm)).toEqual(rhythm);
		expect(levelStateToV13({ scope: '', item: 'x' })).toEqual({ scope: '', item: 'x' });
	});
});

describe('a session at version 13', () => {
	const common = { id: 's', startedAt: 1, endedAt: 2, fatigueDetected: false, latencyMs: 12 };

	it.each([
		['learn', { routine: 'notes' }],
		['free', { routine: 'notes', free: true }],
		['triads', { routine: 'chords' }],
		['triads-zone', { routine: 'chords-zone' }],
		['gesture', { routine: 'changes' }]
	])('of kind %s: says its routine, its kind gone', (kind, origin) => {
		expect(sessionToV13({ ...common, kind, executions: [] })).toEqual({
			...common,
			...origin,
			executions: []
		});
	});

	it('of kind exercise: names its exercise by its new id', () => {
		expect(
			sessionToV13({
				...common,
				kind: 'exercise',
				exerciseId: 'gesture-jam',
				levelReached: 4,
				executions: [{ exerciseId: 'gesture-jam', tempoBpm: 90 }]
			})
		).toEqual({
			...common,
			exercise: 'grid-reading',
			levelReached: 4,
			executions: [{ exerciseId: 'grid-reading', tempoBpm: 90 }]
		});
		expect(
			sessionToV13({ ...common, kind: 'exercise', exerciseId: 'rhythm-two-four', executions: [] })
		).toEqual({ ...common, exercise: 'rhythm-two-four', executions: [] });
	});

	it('renames the exercise of each execution', () => {
		const executions = [
			{ exerciseId: 'gesture-link', tempoBpm: 80 },
			{ exerciseId: 'gesture-climb', scope: 'blues-f', tempoBpm: 85 },
			{ exerciseId: 'rhythm-offbeats', tempoBpm: null }
		];
		expect(sessionToV13({ ...common, kind: 'gesture', executions }).executions).toEqual([
			{ exerciseId: 'inversion-run', tempoBpm: 80 },
			{ exerciseId: 'grid-in-direction', scope: 'blues-f', tempoBpm: 85 },
			{ exerciseId: 'rhythm-offbeats', tempoBpm: null }
		]);
		expect(executions[0].exerciseId).toBe('gesture-link');
	});

	it('keeps a session of an unknown kind, its kind gone and nothing added', () => {
		expect(sessionToV13({ ...common, kind: 'placement', executions: [] })).toEqual({
			...common,
			executions: []
		});
		expect(sessionToV13({ ...common, executions: [] })).toEqual({ ...common, executions: [] });
	});

	it('keeps an exercise session without an exercise, its kind gone and nothing added', () => {
		expect(sessionToV13({ ...common, kind: 'exercise', executions: [] })).toEqual({
			...common,
			executions: []
		});
		expect(sessionToV13({ ...common, kind: 'exercise', exerciseId: 7 })).toEqual(common);
	});

	it('keeps executions it cannot read as they are', () => {
		expect(sessionToV13({ ...common, kind: 'learn', executions: 'x' })).toEqual({
			...common,
			routine: 'notes',
			executions: 'x'
		});
		expect(sessionToV13({ kind: 'learn', executions: [null, 3] })).toEqual({
			routine: 'notes',
			executions: [null, 3]
		});
	});
});

describe('the frozen skills of version 13', () => {
	it('give each catalog exercise the skill it practises', () => {
		// The catalog of version 12 named its exercises by their old ids.
		const renamed = Object.fromEntries(
			Object.entries(SKILL_OF_EXERCISE_V12).map(([id, skill]) => [
				EXERCISE_IDS_V13[id] ?? id,
				skill
			])
		);
		expect(Object.fromEntries(allExercises().map((e) => [e.id, e.practices]))).toEqual(renamed);
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
