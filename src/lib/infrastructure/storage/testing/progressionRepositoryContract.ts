import { beforeEach, describe, expect, it } from 'vitest';
import type { ProgressionRepositoryPort } from '$lib/application/ports';
import type { Progression } from '$lib/domain/types';
import { makeProgression } from './fixtures';

function byExercise(a: Progression, b: Progression): number {
	return a.exerciseId.localeCompare(b.exerciseId);
}

/** Behaviour shared by every ProgressionRepositoryPort implementation. `all()` has no guaranteed order. */
export function progressionRepositoryContract(
	name: string,
	create: () => ProgressionRepositoryPort
): void {
	describe(`${name} honours ProgressionRepositoryPort`, () => {
		let repo: ProgressionRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('returns undefined for an unknown exercise', async () => {
			expect(await repo.get('locate-neck')).toBeUndefined();
		});

		it('stores a progression and reads it by exercise id', async () => {
			const progression = makeProgression();
			await repo.put(progression);
			expect(await repo.get('locate-neck')).toEqual(progression);
		});

		it('replaces the progression stored for the same exercise', async () => {
			await repo.put(makeProgression());
			const faster = makeProgression({ tempoBpm: 104, updatedAt: 2000 });
			await repo.put(faster);
			expect(await repo.get('locate-neck')).toEqual(faster);
			expect(await repo.all()).toHaveLength(1);
		});

		it('lists the progression of every exercise', async () => {
			const progressions = [
				makeProgression(),
				makeProgression({ exerciseId: 'locate-inversions', tempoBpm: 80 })
			];
			for (const progression of progressions) await repo.put(progression);
			expect((await repo.all()).sort(byExercise)).toEqual([...progressions].sort(byExercise));
		});

		it('does not hand out the stored object', async () => {
			const progression = makeProgression();
			await repo.put(progression);
			progression.tempoBpm = 150;
			const read = await repo.get('locate-neck');
			expect(read?.tempoBpm).toBe(96);
		});
	});
}
