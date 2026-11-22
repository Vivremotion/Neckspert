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
	cardsToV13,
	levelStateToV13,
	levelStatesToV13,
	sessionToV13
} from './v13';
import type { BackupV8 } from './v12';
import source from './v13.ts?raw';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { RESERVED_EXERCISE_IDS } from '$lib/domain/definitions/ids';
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

describe('the exercise ids a definition file may not take', () => {
	// A file defining an exercise under an old id would make the backup of its progress
	// unimportable: `validateBackup` refuses those ids on attempts and sessions.
	it('hold every old id version 13 renames', () => {
		for (const old of Object.keys(EXERCISE_IDS_V13)) expect(RESERVED_EXERCISE_IDS).toContain(old);
	});
});

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

	it('keeps a card without a mechanic as it is', () => {
		const card = { key: 'locate:6:F', item: { string: 6, pitch: 'F' }, learnedAt: 5 };
		expect(cardToV13(card)).toStrictEqual(card);
		const odd = { key: 'locate:6:F', mechanic: 3 };
		expect(cardToV13(odd)).toStrictEqual(odd);
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

describe('an attempt at version 13 that names no exercise', () => {
	it('without an exercise id: the skill of its mechanic, its key prefixed by it, the exercise unknown', () => {
		expect(
			attemptToV13({ mechanic: 'triad-zone', cardKey: 'triad-zone:k', success: true })
		).toEqual({
			exerciseId: 'unknown',
			skill: 'chord-zone',
			cardKey: 'chord-zone:k',
			success: true
		});
	});

	it('with an exercise id that is not a string: the skill of its mechanic, the exercise unknown', () => {
		expect(attemptToV13({ exerciseId: 7, mechanic: 'locate', cardKey: 'locate:6:F' })).toEqual({
			exerciseId: 'unknown',
			skill: 'locate-note-string',
			cardKey: 'locate-note-string:6:F'
		});
		expect(attemptToV13({ exerciseId: '', mechanic: 'identify', cardKey: 'identify:5:8' })).toEqual(
			{ exerciseId: 'unknown', skill: 'identify-note', cardKey: 'identify-note:5:8' }
		);
	});

	it('of a mechanic the table does not know: its mechanic as its skill', () => {
		expect(attemptToV13({ mechanic: 'kazoo', cardKey: 'kazoo:1' })).toEqual({
			exerciseId: 'unknown',
			skill: 'kazoo',
			cardKey: 'kazoo:1'
		});
	});

	it('with neither an exercise id nor a mechanic: the skill unknown, its key prefixed by it', () => {
		const row = { id: 3, cardKey: 'locate:6:F', success: false };
		expect(attemptToV13(row)).toStrictEqual({
			id: 3,
			skill: 'unknown',
			exerciseId: 'unknown',
			cardKey: 'unknown:6:F',
			success: false
		});
		expect(attemptToV13({ exerciseId: null, cardKey: 'x' })).toStrictEqual({
			exerciseId: 'unknown',
			skill: 'unknown',
			cardKey: 'unknown:x'
		});
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
		// A place with open strings, and what an old key of it becomes.
		const E = 'E|maj|3:3,2:5,1:1';
		expect(places(E)).toEqual([`${E}@1-0-0`, `${E}@13-12-12`]);
		expect(upgraded('voicing-figure', `voicing-figure:${E}@0@4`)).toBe(`my-own:${E}@1-0-0`);
		// A voicing with a single place: the rank 1 has none, the old key is kept.
		const G = 'G|maj|3:1,2:3,1:5';
		expect(places(G)).toEqual([`${G}@12-12-10`]);
		expect(upgraded('voicing-figure', `voicing-figure:${G}@1@4`)).toBe(`my-own:${G}@1@4`);
	});
});

describe('a backup at version 9', () => {
	it('is the version 8 backup with its cards, attempts, level states and sessions upgraded, no definition files', () => {
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
			sessions: [{ id: 's', routine: 'notes', executions: [{ exerciseId: 'locate-note-string' }] }],
			definitionFiles: []
		});
	});
});

describe('the settings at version 13', () => {
	it('are kept as they are', () => {
		const settings = {
			locale: 'en',
			latency: { note: { ms: 42, provenance: 'system' } },
			clickBleed: true,
			inputDeviceId: 'usb',
			chordDiagram: 'grid'
		};
		const backup = { app: 'neckspert-play', version: 8, settings } as unknown as BackupV8;
		expect(backupV8ToV9(backup).settings).toEqual(settings);
		expect(backupV8ToV9(backup).settings).toBe(settings);
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

describe('the cards of a table at version 13', () => {
	const scheduling = { due: 1, reps: 2 };

	it('are each renamed when no key collides', () => {
		const cards = [
			{ key: 'locate:6:F', mechanic: 'locate', scheduling },
			{ key: 'identify:5:8', mechanic: 'identify', scheduling }
		];
		expect(cardsToV13(cards)).toEqual(cards.map(cardToV13));
	});

	it('keep a card whose new key a card already holds as a card of an unknown skill: its mechanic', () => {
		// A card of version 12 already stored under a key of version 13.
		const holder = { key: 'locate-note-string:6:F', mechanic: 'locate-note-string', scheduling };
		const renamed = { key: 'locate:6:F', mechanic: 'locate', scheduling: { due: 9, reps: 1 } };
		const other = { key: 'locate:5:C', mechanic: 'locate', scheduling };
		const expected = [
			{ key: 'locate:6:F', skill: 'locate', scheduling: { due: 9, reps: 1 } },
			{ key: 'locate-note-string:6:F', skill: 'locate-note-string', scheduling },
			{ key: 'locate-note-string:5:C', skill: 'locate-note-string', scheduling }
		];
		const upgraded = cardsToV13([renamed, holder, other]);
		expect(upgraded).toEqual(expected);
		expect(new Set(upgraded.map((card) => card.key)).size).toBe(upgraded.length);
		expect(cardsToV13([other, holder, renamed])).toEqual([...expected].reverse());
	});

	it('keep a card renamed onto the old key of a card renamed away under its old key, in any order', () => {
		// `a:2:F` would take the key `locate-note-string:2:F` holds, which itself would take a key
		// a third card keeps: each orphan keeps its own old key.
		const first = { key: 'a:2:F', mechanic: 'locate', scheduling };
		const second = { key: 'locate-note-string:2:F', mechanic: 'identify', scheduling };
		const third = { key: 'identify-note:2:F', mechanic: 'identify', scheduling };
		const expected = [
			{ key: 'a:2:F', skill: 'locate', scheduling },
			{ key: 'locate-note-string:2:F', skill: 'identify', scheduling },
			{ key: 'identify-note:2:F', skill: 'identify-note', scheduling }
		];
		expect(cardsToV13([first, second, third])).toEqual(expected);
		expect(cardsToV13([third, second, first])).toEqual([...expected].reverse());
	});

	it('never give two cards the same key nor lose one, whatever the order', () => {
		const cards = [
			{ key: 'a:2:F', mechanic: 'locate', scheduling },
			{ key: 'locate-note-string:2:F', mechanic: 'identify', scheduling },
			{ key: 'identify-note:2:F', mechanic: 'identify', scheduling },
			{ key: 'locate:6:F', mechanic: 'locate', scheduling },
			{ key: 'locate-note-string:6:F', mechanic: 'locate-note-string', scheduling },
			{ key: 'identify:6:F', mechanic: 'identify', scheduling },
			{ key: 'b:6:F', mechanic: 'identify', scheduling },
			{ key: 'triad-anchor:D', mechanic: 'triad-anchor', scheduling },
			{ key: 'chord-anchor:D', mechanic: 'triad-zone', scheduling },
			{ key: 'nothing', scheduling }
		];
		let seed = 7;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		for (let round = 0; round < 12; round++) {
			const order = [...cards];
			for (let i = order.length - 1; i > 0; i--) {
				const j = Math.floor(random() * (i + 1));
				[order[i], order[j]] = [order[j], order[i]];
			}
			const upgraded = cardsToV13(order);
			expect(upgraded).toHaveLength(cards.length);
			expect(new Set(upgraded.map((card) => JSON.stringify(card.key))).size).toBe(cards.length);
		}
	});
});

describe('the level states of a table at version 13', () => {
	const state = (exerciseId: string, level = 2) => ({
		exerciseId,
		scope: 'blues-f',
		item: '',
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	});
	const keyOf = (row: Record<string, unknown>) =>
		JSON.stringify([row.exerciseId, row.scope, row.item]);

	it('are each renamed when no key collides', () => {
		const states = [state('gesture-climb'), state('gesture-zone'), state('rhythm-two-four')];
		expect(levelStatesToV13(states)).toEqual(states.map(levelStateToV13));
	});

	it('keep the old id of a state whose new key a state already holds', () => {
		// A local exercise of version 12 that happened to take the new id.
		const holder = state('grid-in-direction', 7);
		const renamed = state('gesture-climb', 3);
		const upgraded = levelStatesToV13([renamed, holder, state('gesture-zone')]);
		expect(upgraded).toEqual([renamed, holder, state('grid-in-zone')]);
		expect(upgraded).toHaveLength(3);
	});

	it('never give two states the same key', () => {
		const states = [
			state('gesture-climb', 1),
			state('grid-in-direction', 2),
			state('gesture-zone', 3),
			state('grid-in-zone', 4),
			state('gesture-jam', 5),
			state('locate-neck', 6)
		];
		for (const order of [states, [...states].reverse()]) {
			const upgraded = levelStatesToV13(order);
			expect(upgraded).toHaveLength(order.length);
			expect(new Set(upgraded.map(keyOf)).size).toBe(order.length);
			expect(upgraded.map((row) => row.level).sort()).toEqual([1, 2, 3, 4, 5, 6]);
		}
	});
});

describe('a session at version 13', () => {
	const common = { id: 's', startedAt: 1, endedAt: 2, fatigueDetected: false, latencyMs: 12 };

	it('names the routines the catalog’s routines file writes', () => {
		// A tripwire: the old kinds became these routines; a routine renamed in the catalog would
		// leave the sessions stored under its old id naming nothing.
		const written = (
			JSON.parse(CATALOG_FILES['/catalog/routines.json']) as { routines: { id: string }[] }
		).routines.map((routine) => routine.id);
		const frozen = ['learn', 'free', 'triads', 'triads-zone', 'gesture'].map(
			(kind) => sessionToV13({ ...common, kind, executions: [] }).routine
		);
		expect([...new Set(frozen)].sort()).toEqual([...written].sort());
	});

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
		// The catalog of version 12 named its exercises by their old ids; the catalog may hold more.
		const live = Object.fromEntries(allExercises().map((e) => [e.id, e.practices]));
		for (const [id, skill] of Object.entries(SKILL_OF_EXERCISE_V12)) {
			expect(live[EXERCISE_IDS_V13[id] ?? id], id).toBe(skill);
		}
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
