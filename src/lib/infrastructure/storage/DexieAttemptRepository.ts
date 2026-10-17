import type { AttemptRepositoryPort } from '$lib/application/ports';
import type { Attempt, CardKey, RecordedObservation } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieAttemptRepository implements AttemptRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async add(attempt: Attempt): Promise<number> {
		const record: Attempt = { ...attempt };
		delete record.id;
		return (await this.db.attempts.add(record)) as number;
	}

	async setObservations(id: number, observations: RecordedObservation[]): Promise<void> {
		const updated = await this.db.attempts.update(id, { observations });
		if (updated === 0) throw new Error(`No attempt with id ${id}`);
	}

	async setContested(id: number, reason?: string): Promise<void> {
		const updated = await this.db.attempts.update(id, {
			contested: true,
			...(reason !== undefined && { contestReason: reason })
		});
		if (updated === 0) throw new Error(`No attempt with id ${id}`);
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
