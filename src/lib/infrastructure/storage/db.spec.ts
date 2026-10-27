import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { NeckspertDb, createDatabase } from './db';
import { neckLevelOfCard } from './migrations/v9';
import { triadLevelOfCard } from './migrations/v10';
import { DexieBackup } from './DexieBackup';
import { makeAttempt, makeBackupV5, makeCard } from './testing/fixtures';
import type { LevelState } from '$lib/domain/time';

describe('createDatabase', () => {
	it('uses the app name by default', () => {
		const db = createDatabase();
		expect(db).toBeInstanceOf(NeckspertDb);
		expect(db.name).toBe('neckspert-play');
	});

	it('declares the seven tables with their keys and indexes', () => {
		const db = createDatabase(crypto.randomUUID());
		expect(db.tables.map((table) => table.name).sort()).toEqual([
			'attempts',
			'cards',
			'levelStates',
			'progressions',
			'scopedProgressions',
			'sessions',
			'settings'
		]);
		expect(db.attempts.schema.primKey.keyPath).toBe('id');
		expect(db.attempts.schema.primKey.auto).toBe(true);
		expect(db.attempts.schema.indexes.map((index) => index.name).sort()).toEqual([
			'cardKey',
			'promptedAt',
			'sessionId'
		]);
		expect(db.cards.schema.primKey.keyPath).toBe('key');
		expect(db.sessions.schema.primKey.keyPath).toBe('id');
		expect(db.sessions.schema.indexes.map((index) => index.name)).toEqual(['startedAt']);
		expect(db.settings.schema.primKey.keyPath).toBe('id');
		expect(db.progressions.schema.primKey.keyPath).toBe('exerciseId');
		expect(db.progressions.schema.indexes).toEqual([]);
		expect(db.levelStates.schema.primKey.keyPath).toEqual(['exerciseId', 'scope', 'item']);
	});

	it('empties every table when a version 1 database is opened', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(1).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id'
		});
		await old.open();
		await old.table('attempts').add({ cardKey: 'locate:2:F', sessionId: 's1', promptedAt: 1 });
		await old.table('cards').put({ key: 'locate:2:F' });
		await old.table('sessions').put({ id: 's1', startedAt: 1 });
		await old.table('settings').put({ id: 'settings', tempoBpm: 96 });
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		expect(await db.attempts.count()).toBe(0);
		expect(await db.cards.count()).toBe(0);
		expect(await db.sessions.count()).toBe(0);
		expect(await db.settings.count()).toBe(0);
		expect(await db.progressions.count()).toBe(0);
		db.close();
	});

	it('converts placement data when a version 2 database is opened', async () => {
		const name = crypto.randomUUID();
		const old = versionTwo(name);
		await old.open();
		await old
			.table('attempts')
			.bulkAdd([
				v1Attempt({ phase: 'placement', temperature: 'cold', correct: true }),
				v1Attempt({ phase: 'placement', temperature: 'cold', correct: false, promptedAt: 2 }),
				v1Attempt({ phase: 'review', temperature: 'cold', correct: false, promptedAt: 3 })
			]);
		await old
			.table('sessions')
			.bulkPut([
				v1Session({ id: 's1', kind: 'placement', startedAt: 1 }),
				v1Session({ id: 's2', kind: 'learn', startedAt: 2 })
			]);
		await old.table('settings').put({ id: 'settings', tempoBpm: 96, placementDoneAt: 5 });
		await old.table('cards').put(v1Card());
		old.close();

		const db = createDatabase(name);
		await db.open();
		const attempts = await db.attempts.orderBy('promptedAt').toArray();
		expect(attempts.map((a) => a.phase)).toEqual(['probe', 'probe', 'review']);
		expect(attempts.map((a) => a.temperature)).toEqual(['cold', 'hot', 'cold']);
		expect((await db.sessions.toArray()).map((session) => session.kind)).toEqual([
			'learn',
			'learn'
		]);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			latency: {},
			clickBleed: false
		});
		expect(await db.progressions.toArray()).toEqual([
			expect.objectContaining({ exerciseId: 'locate-neck', tempoBpm: 96 })
		]);
		expect((await db.cards.toArray()).map((card) => card.mechanic)).toEqual(['locate']);
		db.close();
	});

	it('upgrades a version 2 database without placement rows untouched', async () => {
		const name = crypto.randomUUID();
		const old = versionTwo(name);
		await old.open();
		await old
			.table('attempts')
			.add(v1Attempt({ phase: 'learning', temperature: 'hot', correct: false }));
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(await db.attempts.toArray()).toEqual([
			expect.objectContaining({ id: 1, phase: 'learning', temperature: 'hot', correct: false })
		]);
		expect(await db.settings.count()).toBe(0);
		expect(await db.progressions.count()).toBe(0);
		db.close();
	});

	it('moves cards off the dropped one-beat lead, then into levels, when a version 3 database is opened', async () => {
		const name = crypto.randomUUID();
		const old = versionThree(name);
		await old.open();
		await old.table('cards').bulkPut([
			v1Card({ leadBeats: 1 }),
			v1Card({
				key: 'locate:3:C',
				target: { direction: 'locate', string: 3, pitch: 'C' },
				leadBeats: 4
			}),
			v1Card({
				key: 'identify:5:8',
				target: { direction: 'identify', string: 5, fret: 8 },
				leadBeats: 1
			})
		]);
		await old.table('attempts').add(v1Attempt({ leadBeats: 1 }));
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		const cards = await db.cards.orderBy('key').toArray();
		expect(cards.map((card) => card.key)).toEqual(['identify:5:8', 'locate:3:C', 'locate:6:A']);
		expect(cards.some((card) => Object.hasOwn(card, 'leadBeats'))).toBe(false);
		// Lead 4 is locate's level 1, the one-beat step moved to 2 its top.
		expect(
			(await db.levelStates.toArray()).map((state) => [state.item, state.level]).sort()
		).toEqual([
			['3:C', 1],
			['5:8', 1],
			['6:A', 2]
		]);
		expect((await db.attempts.toArray()).map((attempt) => attempt.leadBeats)).toEqual([1]);
		db.close();
	});

	it('converts every table when a version 4 database is opened', async () => {
		const name = crypto.randomUUID();
		const old = versionFour(name);
		await old.open();
		await old.table('cards').put(v1Card());
		await old.table('attempts').bulkAdd([
			v1Attempt(),
			v1Attempt({
				cardKey: 'identify:6:3',
				target: { direction: 'identify', string: 6, fret: 3 },
				leadBeats: null,
				promptedAt: 2,
				answer: { kind: 'name', pitch: 'G' },
				timingOffsetMs: null,
				reactionMs: 1400
			})
		]);
		await old.table('sessions').put(v1Session({ tempoBpm: 100 }));
		await old.table('settings').put({ id: 'settings', tempoBpm: 96, locale: 'en' });
		old.close();

		const before = Date.now();
		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);

		const { target: _target, leadBeats: _lead, ...card } = v1Card();
		expect(await db.cards.toArray()).toEqual([
			{ ...card, mechanic: 'locate', item: { string: 6, pitch: 'A' } }
		]);

		const [locate, identify] = await db.attempts.orderBy('promptedAt').toArray();
		expect(locate).toEqual({
			id: 1,
			sessionId: 's1',
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			cardKey: 'locate:6:A',
			phase: 'review',
			temperature: 'cold',
			aids: [],
			promptedAt: 1,
			tempoBpm: 100,
			leadBeats: 2,
			timingOffsetMs: 10,
			reactionMs: 1510,
			correct: true,
			success: true,
			verdict: { relation: 'beat', version: 1, value: 'perfect' },
			measures: {},
			plan: null,
			data: { item: { string: 6, pitch: 'A' }, answer: { midi: 45 }, confusion: null },
			observations: null
		});
		expect(identify).toMatchObject({
			id: 2,
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			tempoBpm: null,
			data: { item: { string: 6, fret: 3 }, answer: { pitch: 'G' }, confusion: null }
		});
		expect(identify).not.toHaveProperty('target');
		expect(identify.verdict).toEqual({ relation: 'free', version: 1, value: 'perfect' });

		expect(await db.sessions.toArray()).toEqual([
			{
				id: 's1',
				kind: 'learn',
				startedAt: 1,
				endedAt: 2,
				fatigueDetected: false,
				executions: [
					{ exerciseId: 'locate-neck', tempoBpm: 100 },
					{ exerciseId: 'identify-neck', tempoBpm: null }
				],
				latencyMs: null
			}
		]);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			locale: 'en',
			latency: {},
			clickBleed: false
		});

		const progressions = await db.progressions.toArray();
		expect(progressions).toEqual([
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 96, updatedAt: expect.any(Number) }
		]);
		expect(progressions[0].updatedAt).toBeGreaterThanOrEqual(before);
		expect(progressions[0].updatedAt).toBeLessThanOrEqual(Date.now());

		const id = await db.attempts.add({ ...locate, id: undefined, promptedAt: 3 });
		expect(id).toBe(3);
		db.close();
	});

	it('gives attempts and sessions of a version 5 database no observations and no latency', async () => {
		const name = crypto.randomUUID();
		const old = versionFive(name);
		await old.open();
		const attempt = {
			sessionId: 's1',
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			cardKey: 'locate:6:A',
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			promptedAt: 1,
			tempoBpm: 100,
			leadBeats: 2,
			timingOffsetMs: 10,
			reactionMs: 1510,
			correct: true,
			verdict: 'perfect',
			data: { item: { string: 6, pitch: 'A' }, answer: { midi: 45 }, confusion: null }
		};
		const session = {
			id: 's1',
			kind: 'learn',
			startedAt: 1,
			endedAt: 2,
			fatigueDetected: false,
			executions: [{ exerciseId: 'locate-neck', tempoBpm: 100 }]
		};
		await old.table('attempts').add(attempt);
		await old.table('sessions').put(session);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		const { aid: _aid, ...kept } = attempt;
		expect(await db.attempts.toArray()).toEqual([
			{
				...kept,
				id: 1,
				observations: null,
				success: true,
				verdict: { relation: 'beat', version: 1, value: 'perfect' },
				aids: [],
				measures: {},
				plan: null
			}
		]);
		expect(await db.sessions.toArray()).toEqual([{ ...session, latencyMs: null }]);
		db.close();
	});

	it('opens at version 10 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(10);
		await db.settings.put({ id: 'settings', locale: 'en' });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', locale: 'en' });
		const progression = {
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			tempoBpm: 104,
			updatedAt: 1
		};
		await db.progressions.put(progression);
		expect(await db.progressions.get('locate-neck')).toEqual(progression);
		db.close();
	});
});

/** Rows as versions 2 to 4 stored them: a target, an answer with its kind, a session tempo. */
function v1Attempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		sessionId: 's1',
		cardKey: 'locate:6:A',
		target: { direction: 'locate', string: 6, pitch: 'A' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 1,
		answer: { kind: 'note', midi: 45 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 1510,
		confusion: null,
		...overrides
	};
}

function v1Card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		key: 'locate:6:A',
		target: { direction: 'locate', string: 6, pitch: 'A' },
		introducedAt: 1,
		introducedInSession: 's1',
		leadBeats: 4,
		scheduling: {
			due: 2,
			stability: 1,
			difficulty: 5,
			elapsedDays: 0,
			scheduledDays: 1,
			learningSteps: 0,
			reps: 1,
			lapses: 0,
			state: 2,
			lastReview: 1
		},
		learnedAt: 1,
		acquiredAt: null,
		masteredAt: null,
		...overrides
	};
}

function v1Session(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 's1',
		kind: 'learn',
		startedAt: 1,
		endedAt: 2,
		fatigueDetected: false,
		tempoBpm: null,
		...overrides
	};
}

function versionTwo(name: string): Dexie {
	const old = new Dexie(name);
	const stores = {
		attempts: '++id, cardKey, sessionId, promptedAt',
		cards: 'key',
		sessions: 'id, startedAt',
		settings: 'id'
	};
	old.version(1).stores(stores);
	old.version(2).stores(stores);
	return old;
}

function versionThree(name: string): Dexie {
	const old = versionTwo(name);
	old.version(3).stores({
		attempts: '++id, cardKey, sessionId, promptedAt',
		cards: 'key',
		sessions: 'id, startedAt',
		settings: 'id'
	});
	return old;
}

function versionFour(name: string): Dexie {
	const old = versionThree(name);
	old.version(4).stores({
		attempts: '++id, cardKey, sessionId, promptedAt',
		cards: 'key',
		sessions: 'id, startedAt',
		settings: 'id'
	});
	return old;
}

function versionFive(name: string): Dexie {
	const old = versionFour(name);
	old.version(5).stores({
		attempts: '++id, cardKey, sessionId, promptedAt',
		cards: 'key',
		sessions: 'id, startedAt',
		settings: 'id',
		progressions: 'exerciseId'
	});
	return old;
}

describe('version 7', () => {
	it('keeps the progressions of a version 6 database, and stores scoped ones apart', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(6).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			progressions: 'exerciseId'
		});
		const progression = {
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			tempoBpm: 104,
			updatedAt: 1
		};
		await old.table('progressions').put(progression);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		expect(await db.progressions.toArray()).toEqual([progression]);
		expect(db.scopedProgressions.schema.primKey.keyPath).toEqual(['exerciseId', 'scope']);
		db.close();
	});
});

describe('version 9', () => {
	it('upgrades a version 8 database: each neck card gets its level, nothing else changes', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(8).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			progressions: 'exerciseId',
			scopedProgressions: '[exerciseId+scope]',
			levelStates: '[exerciseId+scope+item]'
		});
		const card = (key: string, leadBeats: number, learnedAt: number | null) => ({
			key,
			mechanic: key.split(':')[0],
			item: {},
			introducedAt: 1,
			introducedInSession: 's1',
			leadBeats,
			learnedAt,
			acquiredAt: null,
			masteredAt: null
		});
		const cards = [
			card('locate:6:F', 4, 5),
			card('locate:5:A', 2, null),
			card('identify:6:3', 2, 5),
			card('triad-anchor:3-2-1:C:maj:root', 2, 5)
		];
		const attempts = [
			{ sessionId: 's1', cardKey: 'locate:6:F', promptedAt: 10, verdict: { v: 1 } }
		];
		const progressions = [
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 160, updatedAt: 1 }
		];
		const rhythm = {
			exerciseId: 'rhythm-silent-bars',
			scope: '',
			item: '',
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		};
		await old.table('cards').bulkAdd(cards);
		await old.table('attempts').bulkAdd(attempts);
		await old.table('progressions').bulkAdd(progressions);
		await old.table('levelStates').add(rhythm);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		// Version 10 then took the lead off every card, and gave the triad card its level.
		expect(await db.cards.orderBy('key').toArray()).toEqual(
			[...cards]
				.sort((a, b) => a.key.localeCompare(b.key))
				.map(({ leadBeats: _lead, ...card }) => card)
		);
		expect(await db.attempts.toArray()).toEqual([{ ...attempts[0], id: 1 }]);
		expect(await db.progressions.toArray()).toEqual(progressions);
		const states = await db.levelStates.toArray();
		expect(states).toHaveLength(5);
		expect(states).toContainEqual(triadLevelOfCard(cards[3]));
		expect(states).toContainEqual(rhythm);
		// Seeded at 80 bpm, the progression's 160 aside: a lead of 4 is level 1.
		expect(states).toContainEqual(neckLevelOfCard(cards[0]));
		expect(states).toContainEqual(neckLevelOfCard(cards[1]));
		expect(states).toContainEqual(neckLevelOfCard(cards[2]));
		expect(states.find((state) => state.item === '6:F')?.level).toBe(1);
		expect(states.find((state) => state.item === '5:A')?.level).toBe(0);
		expect(states.find((state) => state.item === '6:3')?.level).toBe(1);
		db.close();
	});
});

describe('version 10', () => {
	it('upgrades a version 9 database: each triad card gets its level, no card keeps a lead, nothing else changes', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(9).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			progressions: 'exerciseId',
			scopedProgressions: '[exerciseId+scope]',
			levelStates: '[exerciseId+scope+item]'
		});
		const v9Card =
			(mechanic: string, item: Record<string, unknown>, itemKey: string) =>
			(leadBeats: number, learnedAt: number | null) => ({
				...makeCard({ mechanic: 'locate', learnedAt }),
				key: `${mechanic}:${itemKey}`,
				mechanic,
				item,
				leadBeats
			});
		const triad = (mechanic: string, voicing: string) =>
			v9Card(mechanic, { voicingKey: voicing }, voicing);
		const cards = [
			triad('triad-anchor', 'D|maj|3:5,2:1,1:3')(4, 5),
			triad('triad-anchor', 'C|maj|3:5,2:1,1:3')(2, 5),
			triad('triad-zone', 'D|maj|3:5,2:1,1:3')(4, null),
			v9Card('locate', { string: 2, pitch: 'F' }, '2:F')(8, 5)
		];
		// The locate card's level, seeded by version 9 and moved since: kept as it is.
		const locateLevel = {
			exerciseId: 'locate-neck',
			scope: '',
			item: '2:F',
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		};
		const attempts = [{ ...makeAttempt(), id: 1 }];
		await old.table('cards').bulkAdd(cards);
		await old.table('attempts').bulkAdd(attempts);
		await old.table('levelStates').add(locateLevel);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(10);
		const stored = await db.cards.orderBy('key').toArray();
		expect(stored.some((card) => Object.hasOwn(card, 'leadBeats'))).toBe(false);
		expect(stored).toEqual(
			[...cards]
				.sort((a, b) => a.key.localeCompare(b.key))
				.map(({ leadBeats: _lead, ...card }) => card)
		);
		expect(await db.attempts.toArray()).toEqual(attempts);
		const states = await db.levelStates.toArray();
		const levelOf = (exerciseId: string, item: string) =>
			states.find((state) => state.exerciseId === exerciseId && state.item === item)?.level;
		expect(states).toHaveLength(4);
		expect(states).toContainEqual(locateLevel);
		expect(levelOf('triads-anchor', 'D|maj|3:5,2:1,1:3')).toBe(1);
		expect(levelOf('triads-anchor', 'C|maj|3:5,2:1,1:3')).toBe(2);
		expect(levelOf('triads-zone', 'D|maj|3:5,2:1,1:3')).toBe(0);
		const triads = states.filter((state) => state.exerciseId.startsWith('triads'));
		expect(triads).toHaveLength(3);
		for (const state of triads) {
			expect(state).toMatchObject({ scope: '', successes: 0, failures: 0, resumeAfter: null });
		}

		// The equivalent backup 5 lands on the same rows.
		const imported = createDatabase(crypto.randomUUID());
		await new DexieBackup(imported).importAll(
			JSON.parse(JSON.stringify(makeBackupV5({ cards, attempts, levelStates: [locateLevel] })))
		);
		const byKey = (a: LevelState, b: LevelState) =>
			`${a.exerciseId}/${a.item}`.localeCompare(`${b.exerciseId}/${b.item}`);
		expect((await imported.levelStates.toArray()).sort(byKey)).toEqual([...states].sort(byKey));
		expect(await imported.cards.orderBy('key').toArray()).toEqual(stored);
		imported.close();
		db.close();
	});
});
