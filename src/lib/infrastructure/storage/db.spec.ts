import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { NeckspertDb, createDatabase } from './db';
import { neckLevelOfCard } from './migrations/v9';
import { triadLevelOfCard } from './migrations/v10';
import { DexieBackup } from './DexieBackup';
import {
	makeAttempt,
	makeAttemptV12,
	makeBackupV5,
	makeBackupV6,
	makeBackupV7,
	makeCard,
	makeCardV12,
	makeCycleAttemptV11
} from './testing/fixtures';
import { attemptToV12 } from './migrations/v12';
import { attemptToV13, cardToV13, levelStateToV13, sessionToV13 } from './migrations/v13';
import type { LevelState } from '$lib/domain/time';

describe('createDatabase', () => {
	it('uses the app name by default', () => {
		const db = createDatabase();
		expect(db).toBeInstanceOf(NeckspertDb);
		expect(db.name).toBe('neckspert-play');
	});

	it('declares the six tables with their keys and indexes', () => {
		const db = createDatabase(crypto.randomUUID());
		expect(db.tables.map((table) => table.name).sort()).toEqual([
			'attempts',
			'cards',
			'definitionFiles',
			'levelStates',
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
		expect(db.levelStates.schema.primKey.keyPath).toEqual(['exerciseId', 'scope', 'item']);
		expect(db.definitionFiles.schema.primKey.keyPath).toBe('name');
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
		expect(db.verno).toBe(13);
		expect(await db.attempts.count()).toBe(0);
		expect(await db.cards.count()).toBe(0);
		expect(await db.sessions.count()).toBe(0);
		expect(await db.settings.count()).toBe(0);
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
		// Version 13 then recorded the routine they played instead of their kind.
		expect((await db.sessions.toArray()).map((session) => session.routine)).toEqual([
			'notes',
			'notes'
		]);
		expect((await db.sessions.toArray()).some((session) => 'kind' in session)).toBe(false);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			latency: {},
			clickBleed: false
		});
		expect((await db.cards.toArray()).map((card) => card.skill)).toEqual(['locate-note-string']);
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
		expect(db.verno).toBe(13);
		const cards = await db.cards.orderBy('key').toArray();
		expect(cards.map((card) => card.key)).toEqual([
			'identify-note:5:8',
			'locate-note-string:3:C',
			'locate-note-string:6:A'
		]);
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

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(13);

		const { target: _target, leadBeats: _lead, ...card } = v1Card();
		expect(await db.cards.toArray()).toEqual([
			{
				...card,
				key: 'locate-note-string:6:A',
				skill: 'locate-note-string',
				item: { string: 6, pitch: 'A' }
			}
		]);

		const [locate, identify] = await db.attempts.orderBy('promptedAt').toArray();
		expect(locate).toEqual({
			id: 1,
			sessionId: 's1',
			exerciseId: 'locate-note-string',
			skill: 'locate-note-string',
			cardKey: 'locate-note-string:6:A',
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
			exerciseId: 'identify-note',
			skill: 'identify-note',
			tempoBpm: null,
			data: { item: { string: 6, fret: 3 }, answer: { pitch: 'G' }, confusion: null }
		});
		expect(identify).not.toHaveProperty('target');
		expect(identify.verdict).toEqual({ relation: 'free', version: 1, value: 'perfect' });

		expect(await db.sessions.toArray()).toEqual([
			{
				id: 's1',
				routine: 'notes',
				startedAt: 1,
				endedAt: 2,
				fatigueDetected: false,
				executions: [
					{ exerciseId: 'locate-note-string', tempoBpm: 100 },
					{ exerciseId: 'identify-note', tempoBpm: null }
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
		// The settings tempo became a locate progression at version 5, dropped at version 11: locate
		// plays at a fixed tempo.
		expect(db.tables.map((table) => table.name)).not.toContain('progressions');

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
		expect(db.verno).toBe(13);
		const { aid: _aid, mechanic: _mechanic, ...kept } = attempt;
		expect(await db.attempts.toArray()).toEqual([
			{
				...kept,
				exerciseId: 'locate-note-string',
				skill: 'locate-note-string',
				cardKey: 'locate-note-string:6:A',
				id: 1,
				observations: null,
				success: true,
				verdict: { relation: 'beat', version: 1, value: 'perfect' },
				aids: [],
				measures: {},
				plan: null
			}
		]);
		expect(await db.sessions.toArray()).toEqual([{ ...sessionToV13(session), latencyMs: null }]);
		db.close();
	});

	it('opens at version 13 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(13);
		await db.settings.put({ id: 'settings', locale: 'en' });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', locale: 'en' });
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
	it('drops the locate progression of a version 6 database at version 11', async () => {
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
		expect(db.verno).toBe(13);
		expect(db.tables.map((table) => table.name)).not.toContain('progressions');
		expect(await db.levelStates.count()).toBe(0);
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
		expect(db.verno).toBe(13);
		// Version 10 then took the lead off every card, and gave the triad card its level; version 13
		// named each by its skill.
		expect(await db.cards.orderBy('key').toArray()).toEqual(
			cards
				.map(({ leadBeats: _lead, ...card }) => cardToV13(card))
				.sort((a, b) => String(a.key).localeCompare(String(b.key)))
		);
		expect(await db.attempts.toArray()).toEqual([attemptToV13({ ...attempts[0], id: 1 })]);
		// Version 11 dropped the locate progression: locate plays at a fixed tempo.
		expect(db.tables.map((table) => table.name)).not.toContain('progressions');
		const states = await db.levelStates.toArray();
		expect(states).toHaveLength(5);
		// Version 13 then renamed their exercises.
		const renamed = (state: Record<string, unknown> | null) => state && levelStateToV13(state);
		expect(states).toContainEqual(renamed(triadLevelOfCard(cards[3])));
		expect(states).toContainEqual(rhythm);
		// Seeded at 80 bpm, the progression's 160 aside: a lead of 4 is level 1.
		expect(states).toContainEqual(renamed(neckLevelOfCard(cards[0])));
		expect(states).toContainEqual(renamed(neckLevelOfCard(cards[1])));
		expect(states).toContainEqual(renamed(neckLevelOfCard(cards[2])));
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
				...makeCardV12({ learnedAt }),
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
		const attempts = [{ ...makeAttemptV12(), id: 1 }];
		await old.table('cards').bulkAdd(cards);
		await old.table('attempts').bulkAdd(attempts);
		await old.table('levelStates').add(locateLevel);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(13);
		const stored = await db.cards.orderBy('key').toArray();
		expect(stored.some((card) => Object.hasOwn(card, 'leadBeats'))).toBe(false);
		expect(stored).toEqual(
			cards
				.map(({ leadBeats: _lead, ...card }) => cardToV13(card))
				.sort((a, b) => String(a.key).localeCompare(String(b.key)))
		);
		expect(await db.attempts.toArray()).toEqual(attempts.map(attemptToV13));
		const states = await db.levelStates.toArray();
		const levelOf = (exerciseId: string, item: string) =>
			states.find((state) => state.exerciseId === exerciseId && state.item === item)?.level;
		expect(states).toHaveLength(4);
		// Version 13 then renamed their exercises.
		expect(states).toContainEqual(levelStateToV13(locateLevel));
		expect(levelOf('chord-anchor', 'D|maj|3:5,2:1,1:3')).toBe(1);
		expect(levelOf('chord-anchor', 'C|maj|3:5,2:1,1:3')).toBe(2);
		expect(levelOf('chord-zone', 'D|maj|3:5,2:1,1:3')).toBe(0);
		const triads = states.filter((state) => state.exerciseId.startsWith('chord-'));
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

describe('version 11', () => {
	it('upgrades a version 10 database to 11', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(10).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			progressions: 'exerciseId',
			scopedProgressions: '[exerciseId+scope]',
			levelStates: '[exerciseId+scope+item]'
		});
		const progressions = [
			{ exerciseId: 'gesture-link', mechanic: 'chord-grid', tempoBpm: 95, updatedAt: 1 },
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 120, updatedAt: 1 },
			{ exerciseId: 'gesture-zone', mechanic: 'chord-grid', tempoBpm: 100, updatedAt: 1 }
		];
		const scopedProgressions = [
			{
				exerciseId: 'gesture-climb',
				scope: 'blues-f',
				mechanic: 'chord-grid',
				tempoBpm: 112.5,
				updatedAt: 1
			},
			{
				exerciseId: 'gesture-jam',
				scope: 'iohefy-a',
				mechanic: 'chord-grid',
				tempoBpm: 120,
				updatedAt: 1
			}
		];
		const jam = {
			exerciseId: 'gesture-jam',
			scope: 'iohefy-a',
			item: '',
			level: 2,
			successes: 3,
			failures: 0,
			resumeAfter: null
		};
		const attempts = [
			{ ...makeAttemptV12({ id: 1 }), tempoScope: 'blues-f' },
			{ ...makeAttemptV12({ id: 2 }) }
		];
		await old.table('progressions').bulkAdd(progressions);
		await old.table('scopedProgressions').bulkAdd(scopedProgressions);
		await old.table('levelStates').add(jam);
		await old.table('attempts').bulkAdd(attempts);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(13);
		expect(db.tables.map((table) => table.name)).not.toContain('progressions');
		expect(db.tables.map((table) => table.name)).not.toContain('scopedProgressions');
		expect([...db.backendDB().objectStoreNames]).not.toContain('progressions');
		expect([...db.backendDB().objectStoreNames]).not.toContain('scopedProgressions');
		const level = (exerciseId: string, scope: string, value: number) => ({
			exerciseId,
			scope,
			item: '',
			level: value,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		const byKey = (a: LevelState, b: LevelState) =>
			`${a.exerciseId}/${a.scope}`.localeCompare(`${b.exerciseId}/${b.scope}`);
		const states = (await db.levelStates.toArray()).sort(byKey);
		// Version 13 then renamed their exercises.
		expect(states).toEqual(
			[
				level('grid-in-direction', 'blues-f', 6),
				level('inversion-run', '', 3),
				{ ...jam, exerciseId: 'grid-reading' }
			].sort(byKey)
		);
		const stored = await db.attempts.orderBy('id').toArray();
		expect(stored.some((attempt) => Object.hasOwn(attempt, 'tempoScope'))).toBe(false);
		const { tempoScope: _scope, ...first } = attempts[0] as (typeof attempts)[0] & {
			tempoScope: string;
		};
		expect(stored).toEqual([{ ...first, scope: 'blues-f' }, attempts[1]].map(attemptToV13));

		// The equivalent backup 6 lands on the same rows.
		const imported = createDatabase(crypto.randomUUID());
		await new DexieBackup(imported).importAll(
			JSON.parse(
				JSON.stringify(
					makeBackupV6({
						progressions: [...progressions, ...scopedProgressions],
						attempts,
						levelStates: [jam]
					})
				)
			)
		);
		expect((await imported.levelStates.toArray()).sort(byKey)).toEqual(states);
		expect(await imported.attempts.orderBy('id').toArray()).toEqual(stored);
		imported.close();
		db.close();
	});
});

describe('version 12', () => {
	it('upgrades 11 to 12: a rhythm attempt is of the figure mechanic and keeps the round plan it judged', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(11).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			levelStates: '[exerciseId+scope+item]'
		});
		const rhythm = makeCycleAttemptV11({ id: 1 });
		const locate = makeAttemptV12({ id: 2 });
		await old.table('attempts').bulkAdd([rhythm, locate]);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(13);
		const [upgraded, other] = await db.attempts.orderBy('id').toArray();
		// Version 13 then named each by the skill of its exercise.
		expect(upgraded).toEqual(attemptToV13(attemptToV12(rhythm)));
		expect(upgraded).toMatchObject({
			skill: 'figure-independence',
			cardKey: 'figure-independence:offbeats-2@2'
		});
		expect(upgraded.plan).not.toHaveProperty('cycleBars');
		expect(other).toEqual(attemptToV13(locate));

		// The equivalent backup 7 lands on the same rows.
		const imported = createDatabase(crypto.randomUUID());
		await new DexieBackup(imported).importAll(
			JSON.parse(JSON.stringify(makeBackupV7({ attempts: [rhythm, locate] })))
		);
		expect(await imported.attempts.orderBy('id').toArray()).toEqual([upgraded, other]);
		imported.close();
		db.close();
	});
});

describe('version 13', () => {
	it('upgrades 12 to 13: every card and attempt names its skill, its key prefixed by it; eight exercises take the name of their skill; a session says its routine', async () => {
		const name = crypto.randomUUID();
		const old = new Dexie(name);
		old.version(12).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id',
			levelStates: '[exerciseId+scope+item]'
		});
		const triad = 'D|maj|3:5,2:1,1:3';
		const cards = [
			makeCardV12(),
			makeCardV12({ mechanic: 'identify' }),
			makeCardV12({
				mechanic: 'triad-anchor',
				key: `triad-anchor:${triad}`,
				item: { voicingKey: triad }
			}),
			makeCardV12({
				mechanic: 'triad-zone',
				key: `triad-zone:${triad}`,
				item: { voicingKey: triad }
			})
		];
		const attempt = (exerciseId: string, mechanic: string, key: string, item?: object) => ({
			...makeAttemptV12(),
			exerciseId,
			mechanic,
			cardKey: `${mechanic}:${key}`,
			...(item && { data: { item, answer: null, confusion: null } })
		});
		const shape = `${triad}@2-3-2`;
		const attempts = [
			attempt('locate-neck', 'locate', '2:F'),
			attempt('identify-neck', 'identify', '5:8'),
			attempt('triads-anchor', 'triad-anchor', triad),
			attempt('triads-zone', 'triad-zone', triad),
			attempt('gesture-jam', 'chord-grid', 'jam:iohefy-a#0', {
				rule: 'jam',
				element: 'jam:iohefy-a',
				index: 0
			}),
			attempt('gesture-link', 'chord-grid', 'link:D|maj:3,2,1#1', {
				rule: 'link',
				element: 'link:D|maj:3,2,1',
				index: 1,
				shape
			}),
			attempt('rhythm-offbeats', 'figure', 'offbeats-2@2'),
			attempt('somewhere-else', 'figure', 'x@0'),
			attempt('my-arpeggios', 'voicing-figure', `${triad}@0@4`),
			attempt('my-shapes', 'form-figure', 'maj7@d@4')
		];
		const level = (exerciseId: string, scope: string, item: string) => ({
			exerciseId,
			scope,
			item,
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		});
		const levelStates = [
			level('locate-neck', '', '2:F'),
			level('triads-zone', '', triad),
			level('gesture-climb', 'blues-f', ''),
			level('gesture-link', '', ''),
			level('rhythm-offbeats', '', '')
		];
		const session = (id: string, kind: string, extra: object = {}) => ({
			id,
			kind,
			startedAt: 1,
			endedAt: 2,
			fatigueDetected: false,
			executions: [],
			latencyMs: 0,
			...extra
		});
		const sessions = [
			session('learn', 'learn', {
				executions: [
					{ exerciseId: 'locate-neck', tempoBpm: 80 },
					{ exerciseId: 'identify-neck', tempoBpm: null }
				]
			}),
			session('free', 'free'),
			session('triads', 'triads', { executions: [{ exerciseId: 'triads-anchor', tempoBpm: 80 }] }),
			session('triads-zone', 'triads-zone'),
			session('gesture', 'gesture', {
				executions: [{ exerciseId: 'gesture-climb', scope: 'blues-f', tempoBpm: 85 }]
			}),
			session('exercise', 'exercise', { exerciseId: 'rhythm-offbeats', levelReached: 1 })
		];
		await old.table('cards').bulkAdd(cards);
		await old.table('attempts').bulkAdd(attempts);
		await old.table('levelStates').bulkAdd(levelStates);
		await old.table('sessions').bulkAdd(sessions);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(13);
		const states = await db.levelStates.toArray();
		expect(states).toHaveLength(levelStates.length);
		expect(states.map((state) => [state.exerciseId, state.scope, state.item]).sort()).toEqual(
			[
				['locate-note-string', '', '2:F'],
				['chord-zone', '', triad],
				['grid-in-direction', 'blues-f', ''],
				['inversion-run', '', ''],
				['rhythm-offbeats', '', '']
			].sort()
		);
		expect(states.every((state) => state.level === 2 && state.successes === 1)).toBe(true);
		// Read back by its new key.
		expect(await db.levelStates.get(['grid-in-direction', 'blues-f', ''])).toEqual(
			level('grid-in-direction', 'blues-f', '')
		);
		const reshaped = await db.sessions.orderBy('id').toArray();
		expect(reshaped).toHaveLength(sessions.length);
		const common = { startedAt: 1, endedAt: 2, fatigueDetected: false, latencyMs: 0 };
		expect(reshaped).toEqual([
			{ ...common, id: 'exercise', exercise: 'rhythm-offbeats', levelReached: 1, executions: [] },
			{ ...common, id: 'free', routine: 'notes', free: true, executions: [] },
			{
				...common,
				id: 'gesture',
				routine: 'changes',
				executions: [{ exerciseId: 'grid-in-direction', scope: 'blues-f', tempoBpm: 85 }]
			},
			{
				...common,
				id: 'learn',
				routine: 'notes',
				executions: [
					{ exerciseId: 'locate-note-string', tempoBpm: 80 },
					{ exerciseId: 'identify-note', tempoBpm: null }
				]
			},
			{
				...common,
				id: 'triads',
				routine: 'chords',
				executions: [{ exerciseId: 'chord-anchor', tempoBpm: 80 }]
			},
			{ ...common, id: 'triads-zone', routine: 'chords-zone', executions: [] }
		]);
		const stored = await db.cards.toArray();
		expect(stored).toHaveLength(cards.length);
		expect(stored.map((card) => card.key).sort()).toEqual(
			[
				'locate-note-string:2:F',
				'identify-note:5:8',
				`chord-anchor:${triad}`,
				`chord-zone:${triad}`
			].sort()
		);
		for (const card of stored) {
			expect(card).not.toHaveProperty('mechanic');
			const before = cards.find((old) =>
				String(old.key).endsWith(card.key.slice(card.skill.length))
			);
			expect(card.scheduling).toEqual(before?.scheduling);
		}
		const upgraded = await db.attempts.orderBy('id').toArray();
		expect(upgraded.map(({ skill, cardKey }) => [skill, cardKey])).toEqual([
			['locate-note-string', 'locate-note-string:2:F'],
			['identify-note', 'identify-note:5:8'],
			['chord-anchor', `chord-anchor:${triad}`],
			['chord-zone', `chord-zone:${triad}`],
			['grid-reading', 'grid-reading:iohefy-a#0'],
			['inversion-run', `inversion-run:${shape}`],
			['figure-independence', 'figure-independence:offbeats-2@2'],
			// An exercise the catalog of version 12 did not hold: its id names its skill.
			['somewhere-else', 'somewhere-else:x@0'],
			// The key says the element only: no length, a shape's place by its frets.
			['my-arpeggios', `my-arpeggios:${shape}`],
			['my-shapes', 'my-shapes:maj7@d']
		]);
		expect(upgraded.some((row) => Object.hasOwn(row, 'mechanic'))).toBe(false);
		expect(upgraded.map((row) => row.exerciseId)).toEqual([
			'locate-note-string',
			'identify-note',
			'chord-anchor',
			'chord-zone',
			'grid-reading',
			'inversion-run',
			'rhythm-offbeats',
			'somewhere-else',
			'my-arpeggios',
			'my-shapes'
		]);
		db.close();
	});
});
