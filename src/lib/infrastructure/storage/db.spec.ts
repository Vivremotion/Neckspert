import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { NeckspertDb, createDatabase } from './db';

describe('createDatabase', () => {
	it('uses the app name by default', () => {
		const db = createDatabase();
		expect(db).toBeInstanceOf(NeckspertDb);
		expect(db.name).toBe('neckspert-play');
	});

	it('declares the four tables with their keys and indexes', () => {
		const db = createDatabase(crypto.randomUUID());
		expect(db.tables.map((table) => table.name).sort()).toEqual([
			'attempts',
			'cards',
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
		expect(db.verno).toBe(4);
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
		const attempt = { cardKey: 'locate:2:F', sessionId: 's1', promptedAt: 1 };
		await old.table('attempts').bulkAdd([
			{ ...attempt, phase: 'placement', temperature: 'cold', correct: true },
			{ ...attempt, phase: 'placement', temperature: 'cold', correct: false, promptedAt: 2 },
			{ ...attempt, phase: 'review', temperature: 'cold', correct: false, promptedAt: 3 }
		]);
		await old.table('sessions').bulkPut([
			{ id: 's1', kind: 'placement', startedAt: 1 },
			{ id: 's2', kind: 'learn', startedAt: 2 }
		]);
		await old.table('settings').put({ id: 'settings', tempoBpm: 96, placementDoneAt: 5 });
		await old.table('cards').put({ key: 'locate:2:F', learnedAt: 1 });
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
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', tempoBpm: 96 });
		expect(await db.cards.toArray()).toEqual([{ key: 'locate:2:F', learnedAt: 1 }]);
		db.close();
	});

	it('upgrades a version 2 database without placement rows untouched', async () => {
		const name = crypto.randomUUID();
		const old = versionTwo(name);
		await old.open();
		const row = {
			cardKey: 'locate:2:F',
			sessionId: 's1',
			promptedAt: 1,
			phase: 'learning',
			temperature: 'hot',
			correct: false
		};
		await old.table('attempts').add(row);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(await db.attempts.toArray()).toEqual([{ ...row, id: 1 }]);
		expect(await db.settings.count()).toBe(0);
		db.close();
	});

	it('moves cards off the dropped one-beat lead when a version 3 database is opened', async () => {
		const name = crypto.randomUUID();
		const old = versionThree(name);
		await old.open();
		await old.table('cards').bulkPut([
			{ key: 'locate:2:F', leadBeats: 1 },
			{ key: 'locate:3:C', leadBeats: 4 },
			{ key: 'identify:5:8', leadBeats: 1 }
		]);
		const attempt = { cardKey: 'locate:2:F', sessionId: 's1', promptedAt: 1, leadBeats: 1 };
		await old.table('attempts').add(attempt);
		old.close();

		const db = createDatabase(name);
		await db.open();
		expect(db.verno).toBe(4);
		expect(await db.cards.orderBy('key').toArray()).toEqual([
			{ key: 'identify:5:8', leadBeats: 2 },
			{ key: 'locate:2:F', leadBeats: 2 },
			{ key: 'locate:3:C', leadBeats: 4 }
		]);
		expect(await db.attempts.toArray()).toEqual([{ ...attempt, id: 1 }]);
		db.close();
	});

	it('opens at version 4 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(4);
		await db.settings.put({ id: 'settings', tempoBpm: 96 });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', tempoBpm: 96 });
		db.close();
	});
});

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
