import type { LevelStateRepositoryPort } from '$lib/application/ports';
import type { LevelState } from '$lib/domain/types';
import type { NeckspertDb } from './db';

/** One row per exercise, scope and item, keyed by the three ('' for an absent scope or item). */
export class DexieLevelStateRepository implements LevelStateRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	get(key: { exerciseId: string; scope: string; item: string }): Promise<LevelState | undefined> {
		return this.db.levelStates.get([key.exerciseId, key.scope, key.item]);
	}

	async put(state: LevelState): Promise<void> {
		await this.db.levelStates.put({ ...state });
	}

	all(): Promise<LevelState[]> {
		return this.db.levelStates.toArray();
	}
}
