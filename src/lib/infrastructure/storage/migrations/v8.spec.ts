import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { mechanicRules, timedRules } from '$lib/domain/mechanics';
import v3Export from '../fixtures/backup-v3.json';
import { createDatabase } from '../db';
import { makeAttempt } from '../testing/fixtures';
import { validateBackup } from '../validateBackup';
import { V7_RELATIONS, attemptToV8, backupV3ToV4, relationOfMechanic, settingsToV8 } from './v8';
import { TRIAD_LADDER_V10 } from './v10';

type Row = Record<string, unknown>;

const TRIAD_EXERCISES: Record<string, string> = TRIAD_LADDER_V10.exercises;

/** A fresh copy of the version 3 export made by the application before this model. */
function exportV3(): Row & { attempts: Row[]; settings: Row } {
	return structuredClone(v3Export) as never;
}

/** An attempt as stored before the target model. */
function oldAttempt(overrides: Row = {}): Row {
	return {
		id: 7,
		sessionId: 's1',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: 'locate:2:F',
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		promptedAt: 1000,
		tempoBpm: 80,
		leadBeats: 2,
		timingOffsetMs: 10,
		reactionMs: 900,
		correct: true,
		verdict: 'perfect',
		data: { item: { string: 2, pitch: 'F' }, answer: { midi: 65 }, confusion: null },
		observations: null,
		...overrides
	};
}

describe('relationOfMechanic', () => {
	it('names the relation of each mechanic a version 7 database can hold, frozen', () => {
		expect(V7_RELATIONS).toEqual({
			locate: 'beat',
			identify: 'free',
			'triad-anchor': 'anchor',
			'triad-zone': 'beat',
			'chord-grid': 'grid-change'
		});
		for (const [mechanic, relation] of Object.entries(V7_RELATIONS)) {
			expect(relationOfMechanic(mechanic)).toBe(relation);
		}
	});

	// Tripwire: the migration never reads the registry, but a divergence must be noticed, then
	// decided (the frozen table is the truth of version 7 and stays as it is).
	it('agrees with the relations of today’s registry', () => {
		for (const [mechanic, relation] of Object.entries(V7_RELATIONS)) {
			expect(timedRules(mechanicRules(mechanic)).timing.id).toBe(relation);
		}
	});

	it('throws on a mechanic version 7 did not know', () => {
		expect(() => relationOfMechanic('kazoo')).toThrow('Unknown mechanic at version 7: kazoo');
		expect(() => relationOfMechanic('constructor')).toThrow(
			'Unknown mechanic at version 7: constructor'
		);
	});
});

describe('attemptToV8', () => {
	it('makes an off-beat locate a miss, wraps its verdict for the beat and keeps its shown fret', () => {
		const row = oldAttempt({ verdict: 'offbeat', aid: 'show-position', timingOffsetMs: null });
		const { aid: _aid, verdict: _verdict, ...kept } = row;
		expect(attemptToV8(row, relationOfMechanic)).toEqual({
			...kept,
			success: false,
			verdict: { relation: 'beat', version: 1, value: 'offbeat' },
			aids: ['show-position'],
			measures: {},
			plan: null
		});
	});

	it('makes a slow right name a success, with no aid', () => {
		const row = oldAttempt({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			verdict: 'late',
			tempoBpm: null,
			leadBeats: null
		});
		const converted = attemptToV8(row, relationOfMechanic);
		expect(converted).toMatchObject({
			correct: true,
			success: true,
			verdict: { relation: 'free', version: 1, value: 'late' },
			aids: []
		});
		expect(converted).not.toHaveProperty('aid');
	});

	it('wraps a chord change for the grid, and keeps a wrong or corrected answer a miss', () => {
		const change = attemptToV8(
			oldAttempt({ mechanic: 'chord-grid', correct: false, verdict: 'wrong' }),
			relationOfMechanic
		);
		expect(change).toMatchObject({
			success: false,
			verdict: { relation: 'grid-change', version: 1, value: 'wrong' }
		});
		const corrected = attemptToV8(
			oldAttempt({ mechanic: 'triad-anchor', correct: false, verdict: 'corrected' }),
			relationOfMechanic
		);
		expect(corrected).toMatchObject({
			correct: false,
			success: false,
			verdict: { relation: 'anchor', version: 1, value: 'corrected' }
		});
	});

	it('takes the relation from the function it is given', () => {
		const converted = attemptToV8(oldAttempt(), (mechanic) => `${mechanic}-relation`);
		expect(converted.verdict).toEqual({
			relation: 'locate-relation',
			version: 1,
			value: 'perfect'
		});
	});

	it('leaves an attempt already at the target model as it is, and never wraps twice', () => {
		const target = makeAttempt({ id: 3, success: false, aids: ['string-aid'] }) as unknown as Row;
		expect(attemptToV8(target, relationOfMechanic)).toEqual(target);
		const once = attemptToV8(oldAttempt(), relationOfMechanic);
		expect(attemptToV8(once, relationOfMechanic)).toEqual(once);
	});

	it('does not change the row it is given', () => {
		const row = oldAttempt();
		const copy = structuredClone(row);
		attemptToV8(row, relationOfMechanic);
		expect(row).toEqual(copy);
	});
});

describe('settingsToV8', () => {
	it('gives the calibrated offset to the note and chord sensors, as the player played it', () => {
		expect(settingsToV8({ id: 'settings', locale: 'en', calibrationOffsetMs: 37 })).toEqual({
			id: 'settings',
			locale: 'en',
			latency: {
				note: { ms: 37, provenance: 'player' },
				chord: { ms: 37, provenance: 'player' }
			},
			clickBleed: false
		});
	});

	it('keeps an offset of zero', () => {
		expect(settingsToV8({ calibrationOffsetMs: 0 }).latency).toEqual({
			note: { ms: 0, provenance: 'player' },
			chord: { ms: 0, provenance: 'player' }
		});
	});

	it('gives no latency without a calibration', () => {
		expect(settingsToV8({ calibrationOffsetMs: null })).toEqual({ latency: {}, clickBleed: false });
		expect(settingsToV8({ id: 'settings' })).toEqual({
			id: 'settings',
			latency: {},
			clickBleed: false
		});
	});

	it('leaves settings already converted as they are', () => {
		const settings = {
			locale: 'fr',
			latency: { attack: { ms: 12, provenance: 'system' } },
			clickBleed: true
		};
		expect(settingsToV8(settings)).toEqual(settings);
	});
});

describe('backupV3ToV4', () => {
	it('converts the settings and the attempts, and adds the level states', () => {
		const v3 = {
			app: 'neckspert-play',
			version: 3,
			exportedAt: 5,
			settings: { locale: 'fr', calibrationOffsetMs: 20 },
			progressions: [{ exerciseId: 'locate-neck' }],
			cards: [{ key: 'locate:2:F' }],
			attempts: [oldAttempt({ verdict: 'offbeat' })],
			sessions: [{ id: 's1' }]
		};
		const v4 = backupV3ToV4(v3, relationOfMechanic);
		expect(v4).toEqual({
			...v3,
			version: 4,
			settings: settingsToV8(v3.settings),
			attempts: [attemptToV8(v3.attempts[0], relationOfMechanic)],
			levelStates: []
		});
	});
});

describe('a version 3 export of the application before this model', () => {
	it('is imported as version 4, every attempt with its success and the verdict of its relation', () => {
		const file = exportV3();
		expect(file.version).toBe(3);
		expect(file.attempts.every((attempt) => typeof attempt.verdict === 'string')).toBe(true);

		const v4 = validateBackup(file);
		expect(v4.version).toBe(6);
		// Version 5 adds the level of each neck card, version 6 of each triad card; the exercises'
		// own states start empty.
		expect(v4.levelStates.map((state) => state.exerciseId)).toEqual([
			...v4.cards
				.filter((card) => ['locate', 'identify'].includes(card.mechanic))
				.map((card) => `${card.mechanic}-neck`),
			...v4.cards
				.filter((card) => ['triad-anchor', 'triad-zone'].includes(card.mechanic))
				.map((card) => TRIAD_EXERCISES[card.mechanic])
		]);
		expect(v4.attempts).toHaveLength(file.attempts.length);
		for (const [index, attempt] of v4.attempts.entries()) {
			const old = file.attempts[index];
			expect(attempt.success).toBe(old.correct === true && old.verdict !== 'offbeat');
			expect(attempt.verdict).toEqual({
				relation: relationOfMechanic(old.mechanic as string),
				version: 1,
				value: old.verdict
			});
			expect(attempt.aids).toEqual(old.aid === 'show-position' ? ['show-position'] : []);
			expect(attempt).not.toHaveProperty('aid');
			expect(attempt.observations).toEqual(old.observations);
		}
		expect(v4.settings.latency).toEqual({
			note: { ms: 37, provenance: 'player' },
			chord: { ms: 37, provenance: 'player' }
		});
		expect(v4.settings).not.toHaveProperty('calibrationOffsetMs');
		expect(v4.settings.clickBleed).toBe(false);
	});

	it('holds every mechanic and the verdicts the conversion has to tell apart', () => {
		const v4 = validateBackup(exportV3());
		const relations = new Set(v4.attempts.map((attempt) => attempt.verdict.relation));
		expect([...relations].sort()).toEqual(['anchor', 'beat', 'free', 'grid-change']);
		const find = (mechanic: string, value: string) =>
			v4.attempts.find((a) => a.mechanic === mechanic && a.verdict.value === value);
		expect(find('locate', 'offbeat')).toMatchObject({ correct: true, success: false });
		expect(find('identify', 'late')).toMatchObject({ correct: true, success: true });
		expect(find('triad-anchor', 'corrected')).toMatchObject({
			correct: false,
			success: false,
			contested: true
		});
		expect(find('chord-grid', 'wrong')?.verdict.relation).toBe('grid-change');
		expect(v4.attempts.some((attempt) => attempt.aids.includes('show-position'))).toBe(true);
		expect(v4.progressions.some((progression) => progression.scope !== undefined)).toBe(true);
	});
});

/** The schema of `db.ts` at version 7, as the application before this model declared it. */
function versionSeven(name: string): Dexie {
	const old = new Dexie(name);
	const stores = {
		attempts: '++id, cardKey, sessionId, promptedAt',
		cards: 'key',
		sessions: 'id, startedAt',
		settings: 'id'
	};
	for (const version of [1, 2, 3, 4]) old.version(version).stores(stores);
	old.version(5).stores({ ...stores, progressions: 'exerciseId' });
	old.version(6).stores({ ...stores, progressions: 'exerciseId' });
	old.version(7).stores({
		...stores,
		progressions: 'exerciseId',
		scopedProgressions: '[exerciseId+scope]'
	});
	return old;
}

describe('a version 7 database opened at version 8', () => {
	it('converts its old attempts and settings, leaves a target attempt and every other row', async () => {
		const name = crypto.randomUUID();
		const file = exportV3();
		const progressions = file.progressions as Row[];
		const old = versionSeven(name);
		await old.open();
		await old.table('attempts').bulkAdd(file.attempts);
		const target = makeAttempt({ promptedAt: 9_999_999_999_999, aids: ['string-aid'] });
		const targetId = await old.table('attempts').add(target);
		await old.table('cards').bulkAdd(file.cards as Row[]);
		await old.table('sessions').bulkAdd(file.sessions as Row[]);
		await old.table('progressions').bulkAdd(progressions.filter((p) => p.scope === undefined));
		await old
			.table('scopedProgressions')
			.bulkAdd(progressions.filter((p) => p.scope !== undefined));
		await old.table('settings').put({ id: 'settings', locale: 'en', calibrationOffsetMs: 37 });
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		const attempts = await db.attempts.orderBy('id').toArray();
		expect(attempts).toHaveLength(file.attempts.length + 1);
		expect(attempts.slice(0, -1)).toEqual(
			file.attempts.map((row) => attemptToV8(row, relationOfMechanic))
		);
		expect(attempts.at(-1)).toEqual({ ...target, id: targetId });
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			locale: 'en',
			latency: {
				note: { ms: 37, provenance: 'player' },
				chord: { ms: 37, provenance: 'player' }
			},
			clickBleed: false
		});
		// Version 10 then took the lead off every card.
		expect(await db.cards.toArray()).toEqual(
			[...(file.cards as Row[])]
				.sort((a, b) => String(a.key).localeCompare(String(b.key)))
				.map(({ leadBeats: _lead, ...card }) => card)
		);
		expect(await db.sessions.count()).toBe((file.sessions as Row[]).length);
		expect((await db.progressions.count()) + (await db.scopedProgressions.count())).toBe(
			progressions.length
		);
		// Version 9 then gave each neck card its level, version 10 each triad card, and only those.
		const exerciseOf: Record<string, string> = {
			locate: 'locate-neck',
			identify: 'identify-neck',
			...TRIAD_EXERCISES
		};
		expect((await db.levelStates.toArray()).map((state) => state.exerciseId).sort()).toEqual(
			(file.cards as Row[])
				.map((card) => exerciseOf[String(card.mechanic)])
				.filter((exerciseId) => exerciseId !== undefined)
				.sort()
		);
		// The indexes still answer.
		const first = attempts[0];
		expect((await db.attempts.where('cardKey').equals(first.cardKey).toArray()).length).toBe(
			attempts.filter((attempt) => attempt.cardKey === first.cardKey).length
		);
		db.close();
	});
});

describe('a version 7 database holding an attempt of an unknown mechanic', () => {
	it('fails to open at version 8 and keeps every row of version 7 as it was', async () => {
		const name = crypto.randomUUID();
		const file = exportV3();
		const unknown = oldAttempt({ id: 999, mechanic: 'kazoo', cardKey: 'kazoo:1' });
		const old = versionSeven(name);
		await old.open();
		await old.table('attempts').bulkAdd([...file.attempts, unknown]);
		await old.table('cards').bulkAdd(file.cards as Row[]);
		await old.table('sessions').bulkAdd(file.sessions as Row[]);
		const settings = { id: 'settings', locale: 'en', calibrationOffsetMs: 37 };
		await old.table('settings').put(settings);
		const before = {
			attempts: await old.table('attempts').toArray(),
			cards: await old.table('cards').toArray(),
			sessions: await old.table('sessions').toArray()
		};
		old.close();

		const db = createDatabase(name);
		await expect(db.open()).rejects.toThrow('Unknown mechanic at version 7: kazoo');
		db.close();

		const reopened = versionSeven(name);
		await reopened.open();
		expect(reopened.verno).toBe(7);
		expect(await reopened.table('attempts').toArray()).toEqual(before.attempts);
		expect(await reopened.table('cards').toArray()).toEqual(before.cards);
		expect(await reopened.table('sessions').toArray()).toEqual(before.sessions);
		expect(await reopened.table('settings').toArray()).toEqual([settings]);
		expect(reopened.tables.map((table) => table.name)).not.toContain('levelStates');
		reopened.close();
	});
});
