import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelStateRepositoryPort } from '$lib/application/ports';
import type { LevelState } from '$lib/domain/time';
import { makeLevelState } from './fixtures';

const RHYTHM_KEY = { exerciseId: 'rhythm-silent-bars', scope: '', item: '' };

function byKey(a: LevelState, b: LevelState): number {
	return JSON.stringify([a.exerciseId, a.scope, a.item]).localeCompare(
		JSON.stringify([b.exerciseId, b.scope, b.item])
	);
}

/** Behaviour shared by every LevelStateRepositoryPort implementation. `all()` has no guaranteed order. */
export function levelStateRepositoryContract(
	name: string,
	create: () => LevelStateRepositoryPort
): void {
	describe(`${name} honours LevelStateRepositoryPort`, () => {
		let repo: LevelStateRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('returns undefined for a key it does not hold', async () => {
			expect(await repo.get(RHYTHM_KEY)).toBeUndefined();
		});

		it('stores a state without scope or item under empty strings, and reads it back', async () => {
			const state = makeLevelState();
			await repo.put(state);
			expect(await repo.get(RHYTHM_KEY)).toEqual(state);
			expect(await repo.all()).toEqual([state]);
		});

		it('keys a state by its exercise, its scope and its item together', async () => {
			const states = [
				makeLevelState(),
				makeLevelState({ scope: 'iohefy-a', level: 1 }),
				makeLevelState({ item: 'locate:2:F', level: 2 }),
				makeLevelState({ scope: 'iohefy-a', item: 'locate:2:F', level: -1 }),
				makeLevelState({ exerciseId: 'rhythm-offbeats', level: 3 })
			];
			for (const state of states) await repo.put(state);
			for (const state of states) {
				const { exerciseId, scope, item } = state;
				expect(await repo.get({ exerciseId, scope, item })).toEqual(state);
			}
			expect((await repo.all()).sort(byKey)).toEqual([...states].sort(byKey));
		});

		it('replaces the state stored under the same key', async () => {
			await repo.put(makeLevelState());
			const next = makeLevelState({ level: 1, successes: 0, failures: 0, resumeAfter: 5000 });
			await repo.put(next);
			expect(await repo.all()).toEqual([next]);
		});

		it('keeps its own copy of what it was given', async () => {
			const state = makeLevelState();
			await repo.put(state);
			state.level = 9;
			expect((await repo.get(RHYTHM_KEY))?.level).toBe(0);
		});
	});
}
