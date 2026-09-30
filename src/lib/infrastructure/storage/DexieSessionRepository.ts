import type { SessionRepositoryPort } from '$lib/application/ports';
import type { SessionRecord } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieSessionRepository implements SessionRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async put(record: SessionRecord): Promise<void> {
		await this.db.sessions.put(record);
	}

	get(id: string): Promise<SessionRecord | undefined> {
		return this.db.sessions.get(id);
	}

	list(): Promise<SessionRecord[]> {
		return this.db.sessions.orderBy('startedAt').toArray();
	}
}
