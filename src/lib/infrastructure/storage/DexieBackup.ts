import type { BackupPort } from '$lib/application/ports';
import type { BackupFile } from '$lib/domain/types';
import { SETTINGS_ROW_ID, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieLevelStateRepository } from './DexieLevelStateRepository';
import { DexieProgressionRepository } from './DexieProgressionRepository';
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
			[
				db.attempts,
				db.cards,
				db.sessions,
				db.settings,
				db.progressions,
				db.scopedProgressions,
				db.levelStates
			],
			async (): Promise<BackupFile> => ({
				app: 'neckspert-play',
				version: 4,
				exportedAt: this.now(),
				settings: await new DexieSettingsRepository(db).get(),
				progressions: await new DexieProgressionRepository(db).all(),
				cards: await db.cards.toArray(),
				attempts: await new DexieAttemptRepository(db).all(),
				sessions: await new DexieSessionRepository(db).list(),
				levelStates: await new DexieLevelStateRepository(db).all()
			})
		);
	}

	async importAll(file: unknown): Promise<void> {
		const backup = validateBackup(file, this.now());
		const { db } = this;
		const tables = [
			db.attempts,
			db.cards,
			db.sessions,
			db.settings,
			db.progressions,
			db.scopedProgressions,
			db.levelStates
		];
		await db.transaction('rw', tables, async () => {
			await Promise.all(tables.map((table) => table.clear()));
			// Device ids belong to one browser and one origin: an imported one would not open.
			await db.settings.put({ ...backup.settings, inputDeviceId: null, id: SETTINGS_ROW_ID });
			const progressions = new DexieProgressionRepository(db);
			for (const progression of backup.progressions) await progressions.put(progression);
			await db.cards.bulkAdd(backup.cards.map(withoutLegacyLead));
			await db.attempts.bulkAdd(backup.attempts);
			await db.sessions.bulkAdd(backup.sessions);
			await db.levelStates.bulkAdd(backup.levelStates);
		});
	}
}
