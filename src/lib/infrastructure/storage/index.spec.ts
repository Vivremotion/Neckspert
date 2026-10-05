import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as storage from './index';

describe('storage module', () => {
	it('exposes exactly the roadmap signatures', () => {
		const exported = Object.entries(storage)
			.filter(([, value]) => typeof value === 'function')
			.map(([name]) => name)
			.sort();
		expect(exported).toEqual([
			'DexieAttemptRepository',
			'DexieBackup',
			'DexieCardStateRepository',
			'DexieProgressionRepository',
			'DexieSessionRepository',
			'DexieSettingsRepository',
			'NeckspertDb',
			'createDatabase',
			'downloadBackup',
			'readBackupFile',
			'validateBackup'
		]);
	});

	it('wires the repositories and the backup on one database', async () => {
		const db = storage.createDatabase(crypto.randomUUID());
		await new storage.DexieSettingsRepository(db).update({ locale: 'en' });
		const file = await new storage.DexieBackup(db, () => 1).exportAll();
		expect(file.settings.locale).toBe('en');
		expect(storage.validateBackup(file)).toBe(file);
	});
});
