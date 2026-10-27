import { beforeEach, describe, expect, it } from 'vitest';
import type { CardStateRepositoryPort } from '$lib/application/ports';
import type { CardState } from '$lib/domain/types';
import { makeCard } from './fixtures';

function byKey(a: CardState, b: CardState): number {
	return a.key.localeCompare(b.key);
}

/** Behaviour shared by every CardStateRepositoryPort implementation. `all()` has no guaranteed order. */
export function cardStateRepositoryContract(
	name: string,
	create: () => CardStateRepositoryPort
): void {
	describe(`${name} honours CardStateRepositoryPort`, () => {
		let repo: CardStateRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('returns undefined for an unknown key', async () => {
			expect(await repo.get('locate:2:F')).toBeUndefined();
		});

		it('stores a card and reads it by key', async () => {
			const card = makeCard();
			await repo.put(card);
			expect(await repo.get(card.key)).toEqual(card);
		});

		it('replaces the card stored under the same key', async () => {
			await repo.put(makeCard());
			const updated = makeCard({ learnedAt: 4000, acquiredAt: 9000 });
			await repo.put(updated);
			expect(await repo.get(updated.key)).toEqual(updated);
			expect(await repo.all()).toHaveLength(1);
		});

		it('stores many cards at once', async () => {
			const cards = [makeCard(), makeCard({ mechanic: 'identify' })];
			await repo.putMany(cards);
			expect((await repo.all()).sort(byKey)).toEqual([...cards].sort(byKey));
		});

		it('replaces existing cards when storing many', async () => {
			await repo.put(makeCard());
			const updated = makeCard({ masteredAt: 9000 });
			await repo.putMany([updated, makeCard({ mechanic: 'identify' })]);
			expect(await repo.get(updated.key)).toEqual(updated);
			expect(await repo.all()).toHaveLength(2);
		});
	});
}
