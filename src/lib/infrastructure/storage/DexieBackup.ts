import type { BackupPort } from '$lib/application/ports';
import type { BackupFile } from '$lib/domain/types';
import { SETTINGS_ROW_ID, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import { withoutLegacyLead } from './legacyLead';
import { validateBackup } from './validateBackup';

export class DexieBackup implements BackupPort {
	constructor(
		private readonly db: NeckspertDb,
		private readonly now: () => number = () => Date.now()
	) {}

	exportAll(): Promise<BackupFile> {
		const { db } = this;
		return db.transaction(
			'r',
			[db.attempts, db.cards, db.sessions, db.settings],
			async (): Promise<BackupFile> => ({
				app: 'neckspert-play',
				version: 1,
				exportedAt: this.now(),
				settings: await new DexieSettingsRepository(db).get(),
				cards: await db.cards.toArray(),
				attempts: await new DexieAttemptRepository(db).all(),
				sessions: await new DexieSessionRepository(db).list()
			})
		);
	}

	async importAll(file: unknown): Promise<void> {
		const backup = validateBackup(file);
		const { db } = this;
		await db.transaction('rw', [db.attempts, db.cards, db.sessions, db.settings], async () => {
			await db.attempts.clear();
			await db.cards.clear();
			await db.sessions.clear();
			await db.settings.clear();
			// Device ids belong to one browser and one origin: an imported one would not open.
			await db.settings.put({ ...backup.settings, inputDeviceId: null, id: SETTINGS_ROW_ID });
			await db.cards.bulkAdd(backup.cards.map(withoutLegacyLead));
			await db.attempts.bulkAdd(backup.attempts);
			await db.sessions.bulkAdd(backup.sessions);
		});
	}
}
