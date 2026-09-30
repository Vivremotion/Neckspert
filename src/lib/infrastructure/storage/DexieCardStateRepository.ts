import type { CardStateRepositoryPort } from '$lib/application/ports';
import type { CardKey, CardState } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieCardStateRepository implements CardStateRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	get(key: CardKey): Promise<CardState | undefined> {
		return this.db.cards.get(key);
	}

	async put(state: CardState): Promise<void> {
		await this.db.cards.put(state);
	}

	async putMany(states: CardState[]): Promise<void> {
		await this.db.cards.bulkPut(states);
	}

	all(): Promise<CardState[]> {
		return this.db.cards.toArray();
	}
}
