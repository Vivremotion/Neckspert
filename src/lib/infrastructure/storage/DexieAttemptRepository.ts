import type { AttemptRepositoryPort } from '$lib/application/ports';
import type { Attempt, CardKey } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieAttemptRepository implements AttemptRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async add(attempt: Attempt): Promise<number> {
		const record: Attempt = { ...attempt };
		delete record.id;
		return (await this.db.attempts.add(record)) as number;
	}

	listByCard(key: CardKey): Promise<Attempt[]> {
		return this.db.attempts.where('cardKey').equals(key).sortBy('promptedAt');
	}

	listBySession(sessionId: string): Promise<Attempt[]> {
		return this.db.attempts.where('sessionId').equals(sessionId).sortBy('promptedAt');
	}

	listSince(epochMs: number): Promise<Attempt[]> {
		return this.db.attempts.where('promptedAt').aboveOrEqual(epochMs).toArray();
	}

	all(): Promise<Attempt[]> {
		return this.db.attempts.orderBy('promptedAt').toArray();
	}
}
