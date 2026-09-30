import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
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

	it('opens at version 1 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(1);
		await db.settings.put({ id: 'settings', tempoBpm: 96 });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', tempoBpm: 96 });
		db.close();
	});
});
