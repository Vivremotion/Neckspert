import { beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRepositoryPort } from '$lib/application/ports';
import { makeAttempt } from './fixtures';

/** Behaviour shared by every AttemptRepositoryPort implementation. */
export function attemptRepositoryContract(name: string, create: () => AttemptRepositoryPort): void {
	describe(`${name} honours AttemptRepositoryPort`, () => {
		let repo: AttemptRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('stores an attempt and returns its id', async () => {
			const attempt = makeAttempt();
			const id = await repo.add(attempt);
			expect(await repo.all()).toEqual([{ ...attempt, id }]);
		});

		it('assigns increasing ids', async () => {
			const first = await repo.add(makeAttempt());
			const second = await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect(first).toBeGreaterThan(0);
			expect(second).toBeGreaterThan(first);
		});

		it('does not mutate the given attempt', async () => {
			const attempt = makeAttempt();
			await repo.add(attempt);
			expect(attempt).not.toHaveProperty('id');
		});

		it('stores a new attempt when the given one already has an id', async () => {
			const first = await repo.add(makeAttempt());
			const [stored] = await repo.all();
			const second = await repo.add({ ...stored, promptedAt: 2000 });
			expect(second).not.toBe(first);
			expect((await repo.all()).map((a) => a.id)).toEqual([first, second]);
		});

		it("lists a card's attempts, oldest first", async () => {
			await repo.add(makeAttempt({ promptedAt: 3000 }));
			await repo.add(makeAttempt({ promptedAt: 1000 }));
			await repo.add(makeAttempt({ mechanic: 'identify', promptedAt: 2000 }));
			expect((await repo.listByCard('locate:2:F')).map((a) => a.promptedAt)).toEqual([1000, 3000]);
			expect((await repo.listByCard('identify:5:8')).map((a) => a.promptedAt)).toEqual([2000]);
			expect(await repo.listByCard('identify:1:0')).toEqual([]);
		});

		it("lists a session's attempts, oldest first", async () => {
			await repo.add(makeAttempt({ sessionId: 's2', promptedAt: 3000 }));
			await repo.add(makeAttempt({ sessionId: 's1', promptedAt: 1000 }));
			await repo.add(makeAttempt({ sessionId: 's2', promptedAt: 2000 }));
			expect((await repo.listBySession('s2')).map((a) => a.promptedAt)).toEqual([2000, 3000]);
			expect(await repo.listBySession('unknown')).toEqual([]);
		});

		it('lists attempts prompted at or after a time, oldest first', async () => {
			await repo.add(makeAttempt({ promptedAt: 3000 }));
			await repo.add(makeAttempt({ promptedAt: 1000 }));
			await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect((await repo.listSince(2000)).map((a) => a.promptedAt)).toEqual([2000, 3000]);
			expect(await repo.listSince(4000)).toEqual([]);
		});

		it('lists every attempt oldest first, in insertion order for equal times', async () => {
			const late = await repo.add(makeAttempt({ promptedAt: 2000 }));
			const early = await repo.add(makeAttempt({ promptedAt: 1000 }));
			const tied = await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect((await repo.all()).map((a) => a.id)).toEqual([early, late, tied]);
		});
	});
}
