import { describe, expect, it } from 'vitest';
import { exerciseById } from '$lib/domain/exercise/registry';
import {
	AID_LEVELS_V13,
	AIDS_V13,
	aidLevelsOfFilesV14,
	aidLevelsV14,
	attemptToV14,
	backupV9ToV10,
	levelStateToV14,
	sessionToV14
} from './v14';
import type { BackupV9 } from './v13';
import source from './v14.ts?raw';

const state = (overrides: Record<string, unknown> = {}) => ({
	exerciseId: 'rhythm-two-four',
	scope: '',
	item: '',
	level: 0,
	successes: 1,
	failures: 2,
	resumeAfter: null,
	...overrides
});

/** A definition file as the player imported it, its exercises' levels as written. */
const file = (name: string, exercises: unknown[]) => ({
	name,
	text: JSON.stringify({ format: 1, exercises }),
	importedAt: 1
});

describe('the aid levels of version 13', () => {
	// A tripwire: each exercise that had one aid level made it its level 1 (issue #19), so the
	// catalog counts as many levels as version 13 did, its aid level included.
	const LEVELS_AT_V13: Record<string, number> = {
		'inversion-run': 10,
		'grid-in-direction': 10,
		'grid-in-zone': 10,
		'grid-reading': 10,
		'rhythm-silent-bars': 7,
		'rhythm-two-four': 4,
		'rhythm-offbeats': 5
	};

	it('name the seven exercises that had one aid level each', () => {
		expect(AID_LEVELS_V13).toEqual(
			Object.fromEntries(Object.keys(LEVELS_AT_V13).map((id) => [id, 1]))
		);
	});

	it.each(Object.entries(LEVELS_AT_V13))(
		'%s: in the catalog, with as many levels as at version 13 (%i)',
		(id, count) => {
			expect(exerciseById(id).levels).toHaveLength(count);
		}
	);

	it('imports nothing from the live code', () => {
		expect(source).not.toMatch(/from '\$lib\//);
	});

	it('keep the aids an attempt could list up to database 13', () => {
		expect(AIDS_V13).toEqual([
			'show-position',
			'string-aid',
			'cursor',
			'listen',
			'play-along',
			'aid-level'
		]);
	});
});

describe('the aid levels of imported definition files', () => {
	it('count, by exercise, the levels that write aid: true', () => {
		const files = [
			file('a.json', [
				{ id: 'mine', levels: [{ aid: true }, { aid: true }, { tempo: 90 }] },
				{ id: 'plain', levels: [{ tempo: 90 }] }
			]),
			file('b.json', [{ id: 'other', levels: [{ aid: true }, {}] }])
		];
		expect(aidLevelsOfFilesV14(files)).toEqual({ mine: 2, other: 1 });
	});

	it('give nothing for an unreadable text, nor for entries they cannot read', () => {
		expect(
			aidLevelsOfFilesV14([
				{ name: 'broken.json', text: '{ not json', importedAt: 1 },
				{ name: 'list.json', text: '[]', importedAt: 1 },
				{
					name: 'odd.json',
					text: JSON.stringify({
						exercises: [null, { levels: [{ aid: true }] }, { id: 'x', levels: 3 }]
					}),
					importedAt: 1
				},
				{ name: 'no-text.json', importedAt: 1 }
			])
		).toEqual({});
	});

	it('keep the first file that defines an exercise: a later one is refused at load', () => {
		const files = [
			file('a.json', [{ id: 'mine', levels: [{ aid: true }] }]),
			file('b.json', [{ id: 'mine', levels: [{ aid: true }, { aid: true }] }])
		];
		expect(aidLevelsOfFilesV14(files)).toEqual({ mine: 1 });
	});

	it('give way to the catalog on an id it holds: a file taking it is refused at load', () => {
		const files = [
			file('a.json', [{ id: 'rhythm-two-four', levels: [{ aid: true }, { aid: true }] }])
		];
		expect(aidLevelsV14(files)).toEqual({ ...AID_LEVELS_V13 });
	});
});

describe('a level state at version 14', () => {
	it.each([
		[-1, 0],
		[0, 1],
		[8, 9]
	])('of an exercise level of an exercise that had an aid level: %i becomes %i', (from, to) => {
		expect(levelStateToV14(state({ level: from }), AID_LEVELS_V13)).toEqual({
			exerciseId: 'rhythm-two-four',
			scope: '',
			item: '',
			level: to,
			successes: 1,
			failures: 2
		});
	});

	it('moves in every scope', () => {
		expect(
			levelStateToV14(
				state({ exerciseId: 'grid-reading', scope: 'blues-f', level: 2 }),
				AID_LEVELS_V13
			)
		).toMatchObject({ scope: 'blues-f', level: 3 });
	});

	it('of an item does not move', () => {
		expect(levelStateToV14(state({ item: 'x@0', level: -1 }), AID_LEVELS_V13)).toMatchObject({
			item: 'x@0',
			level: -1
		});
	});

	it('of an exercise that had no aid level, or that nobody knows, does not move', () => {
		expect(
			levelStateToV14(state({ exerciseId: 'chord-anchor', level: 2 }), AID_LEVELS_V13)
		).toMatchObject({ level: 2 });
		expect(
			levelStateToV14(state({ exerciseId: 'gesture-climb', level: -1 }), AID_LEVELS_V13)
		).toMatchObject({ level: -1 });
	});

	it('of an imported exercise that wrote two aid levels moves by 2', () => {
		const aidLevels = aidLevelsV14([
			file('a.json', [{ id: 'mine', levels: [{ aid: true }, { aid: true }, {}] }])
		]);
		expect(levelStateToV14(state({ exerciseId: 'mine', level: -2 }), aidLevels)).toMatchObject({
			level: 0
		});
	});

	it('loses resumeAfter, whatever it held', () => {
		const kept = levelStateToV14(
			state({ exerciseId: 'chord-anchor', resumeAfter: 5 }),
			AID_LEVELS_V13
		);
		expect(kept).not.toHaveProperty('resumeAfter');
	});

	it('does not mutate the row it reads', () => {
		const row = state({ level: 2 });
		levelStateToV14(row, AID_LEVELS_V13);
		expect(row).toEqual(state({ level: 2 }));
	});
});

describe('a session at version 14', () => {
	it('of one exercise that had an aid level: its level reached moves', () => {
		expect(
			sessionToV14({ id: 's', exercise: 'rhythm-offbeats', levelReached: -1 }, AID_LEVELS_V13)
		).toEqual({
			id: 's',
			exercise: 'rhythm-offbeats',
			levelReached: 0
		});
	});

	it('of another exercise, of a routine or without a level reached: as it is', () => {
		const rows = [
			{ id: 'a', exercise: 'chord-anchor', levelReached: 2 },
			{ id: 'b', routine: 'changes', levelReached: 2 },
			{ id: 'c', exercise: 'rhythm-offbeats' }
		];
		expect(rows.map((row) => sessionToV14(row, AID_LEVELS_V13))).toEqual(rows);
	});
});

describe('an attempt at version 14', () => {
	const cycle = (overrides: Record<string, unknown> = {}) => ({
		exerciseId: 'rhythm-silent-bars',
		phase: 'probe',
		aids: ['cursor'],
		verdict: { relation: 'cycle', version: 1, value: { passed: true } },
		data: { item: { figureId: 'f', level: -1 }, level: -1, report: {} },
		...overrides
	});

	it('judged by the cycle verdict of an exercise that had an aid level: its level moves, the rest as it is', () => {
		expect(attemptToV14(cycle(), AID_LEVELS_V13)).toEqual(
			cycle({ data: { item: { figureId: 'f', level: -1 }, level: 0, report: {} } })
		);
	});

	it('judged otherwise, or of another exercise: as it is', () => {
		const response = cycle({ verdict: { relation: 'locate', version: 1, value: 'perfect' } });
		const other = cycle({ exerciseId: 'chord-anchor' });
		expect(attemptToV14(response, AID_LEVELS_V13)).toEqual(response);
		expect(attemptToV14(other, AID_LEVELS_V13)).toEqual(other);
	});
});

describe('a backup at version 10', () => {
	it('is the version 9 backup with its levels shifted once, by the catalog and its files', () => {
		const definitionFiles = [file('a.json', [{ id: 'mine', levels: [{ aid: true }, {}] }])];
		const backup = {
			app: 'neckspert-play',
			version: 9,
			cards: [{ key: 'k' }],
			attempts: [
				{
					exerciseId: 'mine',
					verdict: { relation: 'cycle', version: 1, value: null },
					data: { level: -1 }
				}
			],
			levelStates: [state({ level: -1 }), state({ exerciseId: 'mine', level: 0, resumeAfter: 9 })],
			sessions: [{ id: 's', exercise: 'rhythm-two-four', levelReached: 1 }],
			definitionFiles
		} as unknown as BackupV9;
		expect(backupV9ToV10(backup)).toEqual({
			app: 'neckspert-play',
			version: 10,
			cards: [{ key: 'k' }],
			attempts: [
				{
					exerciseId: 'mine',
					verdict: { relation: 'cycle', version: 1, value: null },
					data: { level: 0 }
				}
			],
			levelStates: [
				{ exerciseId: 'rhythm-two-four', scope: '', item: '', level: 0, successes: 1, failures: 2 },
				{ exerciseId: 'mine', scope: '', item: '', level: 1, successes: 1, failures: 2 }
			],
			sessions: [{ id: 's', exercise: 'rhythm-two-four', levelReached: 2 }],
			definitionFiles
		});
	});
});
