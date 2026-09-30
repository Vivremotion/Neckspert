import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { InMemoryAttemptRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { attemptRepositoryContract } from './testing/attemptRepositoryContract';
import { makeAttempt } from './testing/fixtures';

attemptRepositoryContract('InMemoryAttemptRepository', () => new InMemoryAttemptRepository());
attemptRepositoryContract(
	'DexieAttemptRepository',
	() => new DexieAttemptRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieAttemptRepository', () => {
	it('keeps attempts when the database is reopened', async () => {
		const name = crypto.randomUUID();
		const first = createDatabase(name);
		const id = await new DexieAttemptRepository(first).add(makeAttempt());
		first.close();

		const reopened = createDatabase(name);
		expect((await new DexieAttemptRepository(reopened).all()).map((a) => a.id)).toEqual([id]);
		reopened.close();
	});
});
