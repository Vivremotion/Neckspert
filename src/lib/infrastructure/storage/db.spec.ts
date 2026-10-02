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
		expect(db.verno).toBe(2);
		expect(await db.attempts.count()).toBe(0);
		expect(await db.cards.count()).toBe(0);
		expect(await db.sessions.count()).toBe(0);
		expect(await db.settings.count()).toBe(0);
		db.close();
	});

	it('opens at version 2 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(2);
		await db.settings.put({ id: 'settings', tempoBpm: 96 });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', tempoBpm: 96 });
		db.close();
	});
});
