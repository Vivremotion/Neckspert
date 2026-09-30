import type { SettingsRepositoryPort } from '$lib/application/ports';
import { DEFAULT_SETTINGS, type Settings } from '$lib/domain/types';
import { SETTINGS_ROW_ID, type NeckspertDb, type SettingsRow } from './db';

function withoutId(row: SettingsRow): Partial<Settings> {
	const stored: Partial<SettingsRow> = { ...row };
	delete stored.id;
	return stored;
}

export class DexieSettingsRepository implements SettingsRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async get(): Promise<Settings> {
		return { ...DEFAULT_SETTINGS, ...(await this.stored()) };
	}

	update(patch: Partial<Settings>): Promise<Settings> {
		return this.db.transaction('rw', this.db.settings, async () => {
			const stored = { ...(await this.stored()), ...patch };
			await this.db.settings.put({ ...stored, id: SETTINGS_ROW_ID });
			return { ...DEFAULT_SETTINGS, ...stored };
		});
	}

	private async stored(): Promise<Partial<Settings>> {
		const row = await this.db.settings.get(SETTINGS_ROW_ID);
		return row ? withoutId(row) : {};
	}
}
