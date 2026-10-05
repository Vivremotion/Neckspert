import Dexie, { type EntityTable } from 'dexie';
import {
	SHORTEST_LEAD,
	type Attempt,
	type CardState,
	type Progression,
	type SessionRecord,
	type Settings
} from '$lib/domain/types';
import { convertV1 } from './legacy/v1';

export const DEFAULT_DATABASE_NAME = 'neckspert-play';

export const SETTINGS_ROW_ID = 'settings';

/** The single settings row: only the fields changed from DEFAULT_SETTINGS. */
export interface SettingsRow extends Partial<Settings> {
	id: typeof SETTINGS_ROW_ID;
}

export class NeckspertDb extends Dexie {
	attempts!: EntityTable<Attempt, 'id'>;
	cards!: EntityTable<CardState, 'key'>;
	sessions!: EntityTable<SessionRecord, 'id'>;
	settings!: EntityTable<SettingsRow, 'id'>;
	progressions!: EntityTable<Progression, 'exerciseId'>;

	constructor(name: string) {
		super(name);
		const stores = {
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id'
		};
		this.version(1).stores(stores);
		// Version 2 changed the learning model; old progress is discarded, not migrated.
		this.version(2)
			.stores(stores)
			.upgrade((tx) => Promise.all(Object.keys(stores).map((name) => tx.table(name).clear())));
		// Version 3 replaced placement with probes. A missed placement turns hot: it measured
		// no forgetting (spec 2026-10-03, section 1). At the threshold lead, correct = direct recall.
		this.version(3)
			.stores(stores)
			.upgrade(async (tx) => {
				await tx
					.table('attempts')
					.filter((row) => row.phase === 'placement')
					.modify((row) => {
						row.phase = 'probe';
						if (row.correct === false) row.temperature = 'hot';
					});
				await tx
					.table('sessions')
					.filter((row) => row.kind === 'placement')
					.modify((row) => {
						row.kind = 'learn';
					});
				await tx
					.table('settings')
					.toCollection()
					.modify((row) => {
						delete row.placementDoneAt;
					});
			});
		// Version 4 dropped the 1-beat lead step (spec 2026-10-04, section 1). Cards move to the
		// shortest step left; attempts keep the lead they were played at.
		this.version(4)
			.stores(stores)
			.upgrade((tx) =>
				tx
					.table('cards')
					.filter((row) => row.leadBeats === 1)
					.modify((row) => {
						row.leadBeats = SHORTEST_LEAD;
					})
			);
		// Version 5 keys cards and attempts by mechanic and item, gives attempts their tempo and
		// sessions their executions, and moves the settings tempo to the locate-neck progression
		// (spec 2026-10-05, section 5). Same conversion as the import of a version 1 backup.
		this.version(5)
			.stores({ ...stores, progressions: 'exerciseId' })
			.upgrade(async (tx) => {
				const [settingsRows, cards, attempts, sessions] = await Promise.all([
					tx.table('settings').toArray(),
					tx.table('cards').toArray(),
					tx.table('attempts').toArray(),
					tx.table('sessions').toArray()
				]);
				const settingsRow = settingsRows.find((row) => row.id === SETTINGS_ROW_ID);
				const { id: _id, ...storedSettings } = settingsRow ?? {};
				const converted = convertV1(
					{ settings: storedSettings, cards, attempts, sessions },
					Date.now()
				);
				await Promise.all(
					['settings', 'cards', 'attempts', 'sessions'].map((name) => tx.table(name).clear())
				);
				if (settingsRow) {
					await tx.table('settings').put({ ...converted.settings, id: SETTINGS_ROW_ID });
				}
				await tx.table('cards').bulkAdd(converted.cards);
				await tx.table('attempts').bulkAdd(converted.attempts);
				await tx.table('sessions').bulkAdd(converted.sessions);
				await tx.table('progressions').bulkAdd(converted.progressions);
			});
	}
}

export function createDatabase(name: string = DEFAULT_DATABASE_NAME): NeckspertDb {
	return new NeckspertDb(name);
}
