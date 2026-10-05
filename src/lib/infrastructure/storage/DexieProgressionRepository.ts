import type { ProgressionRepositoryPort } from '$lib/application/ports';
import type { ExerciseId, Progression } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieProgressionRepository implements ProgressionRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	get(exerciseId: ExerciseId): Promise<Progression | undefined> {
		return this.db.progressions.get(exerciseId);
	}

	async put(progression: Progression): Promise<void> {
		await this.db.progressions.put(progression);
	}

	all(): Promise<Progression[]> {
		return this.db.progressions.toArray();
	}
}
