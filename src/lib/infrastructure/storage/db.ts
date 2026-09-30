import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, CardState, SessionRecord, Settings } from '$lib/domain/types';

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

	constructor(name: string) {
		super(name);
		this.version(1).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id'
		});
	}
}

export function createDatabase(name: string = DEFAULT_DATABASE_NAME): NeckspertDb {
	return new NeckspertDb(name);
}
