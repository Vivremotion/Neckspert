import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionRepositoryPort } from '$lib/application/ports';
import { makeSession } from './fixtures';

/** Behaviour shared by every SessionRepositoryPort implementation. */
export function sessionRepositoryContract(name: string, create: () => SessionRepositoryPort): void {
	describe(`${name} honours SessionRepositoryPort`, () => {
		let repo: SessionRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.list()).toEqual([]);
		});

		it('returns undefined for an unknown id', async () => {
			expect(await repo.get('unknown')).toBeUndefined();
		});

		it('stores a record and reads it by id', async () => {
			const record = makeSession();
			await repo.put(record);
			expect(await repo.get(record.id)).toEqual(record);
		});

		it('replaces the record stored under the same id', async () => {
			await repo.put(makeSession({ endedAt: null }));
			const ended = makeSession({ endedAt: 4000, fatigueDetected: true });
			await repo.put(ended);
			expect(await repo.get(ended.id)).toEqual(ended);
			expect(await repo.list()).toHaveLength(1);
		});

		it('lists records oldest first by start time', async () => {
			await repo.put(makeSession({ id: 'c', startedAt: 3000 }));
			await repo.put(makeSession({ id: 'a', startedAt: 1000 }));
			await repo.put(makeSession({ id: 'b', startedAt: 2000 }));
			expect((await repo.list()).map((record) => record.id)).toEqual(['a', 'b', 'c']);
		});
	});
}
