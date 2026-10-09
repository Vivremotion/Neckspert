import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { InMemorySettingsRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import { settingsRepositoryContract } from './testing/settingsRepositoryContract';

settingsRepositoryContract('InMemorySettingsRepository', () => new InMemorySettingsRepository());
settingsRepositoryContract(
	'DexieSettingsRepository',
	() => new DexieSettingsRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieSettingsRepository', () => {
	it('stores a single row holding only the changed fields', async () => {
		const db = createDatabase(crypto.randomUUID());
		const repo = new DexieSettingsRepository(db);
		await repo.update({ calibrationOffsetMs: 42 });
		await repo.update({ locale: 'en' });
		expect(await db.settings.count()).toBe(1);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			calibrationOffsetMs: 42,
			locale: 'en'
		});
	});

	it('reads settings saved through another repository on the same database', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieSettingsRepository(db).update({ calibrationOffsetMs: 104 });
		expect(await new DexieSettingsRepository(db).get()).toEqual({
			...DEFAULT_SETTINGS,
			calibrationOffsetMs: 104
		});
	});

	it('reads settings stored before the chord diagram field as drawn on strings', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.settings.put({ id: 'settings', locale: 'en', calibrationOffsetMs: 12 });
		expect((await new DexieSettingsRepository(db).get()).chordDiagram).toBe('strings');
	});

	it('reads settings stored before the diagnostics field with the default journal settings', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.settings.put({ id: 'settings', locale: 'en', calibrationOffsetMs: 12 });
		const settings = await new DexieSettingsRepository(db).get();
		expect(settings.diagnostics).toEqual({ enabled: null, budgetMb: 300 });
		expect(settings.locale).toBe('en');
	});
});
