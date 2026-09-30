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
		await repo.update({ tempoBpm: 96 });
		await repo.update({ locale: 'en' });
		expect(await db.settings.count()).toBe(1);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			tempoBpm: 96,
			locale: 'en'
		});
	});

	it('reads settings saved through another repository on the same database', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieSettingsRepository(db).update({ placementDoneAt: 7000 });
		expect(await new DexieSettingsRepository(db).get()).toEqual({
			...DEFAULT_SETTINGS,
			placementDoneAt: 7000
		});
	});
});
