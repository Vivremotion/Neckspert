import type { ProgressionRepositoryPort } from '$lib/application/ports';
import type { ExerciseId, Progression } from '$lib/domain/types';
import type { NeckspertDb } from './db';

/** An exercise's own progressions in one table, those of a scope of it in another. */
export class DexieProgressionRepository implements ProgressionRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	get(exerciseId: ExerciseId, scope?: string): Promise<Progression | undefined> {
		if (scope === undefined) return this.db.progressions.get(exerciseId);
		return this.db.scopedProgressions.get([exerciseId, scope] as never);
	}

	async put(progression: Progression): Promise<void> {
		const { scope } = progression;
		if (scope === undefined) await this.db.progressions.put(progression);
		else await this.db.scopedProgressions.put({ ...progression, scope });
	}

	async all(): Promise<Progression[]> {
		const [own, scoped] = await Promise.all([
			this.db.progressions.toArray(),
			this.db.scopedProgressions.toArray()
		]);
		return [...own, ...scoped];
	}
}
