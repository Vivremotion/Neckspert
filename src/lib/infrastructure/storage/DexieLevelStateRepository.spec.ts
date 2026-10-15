import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { InMemoryLevelStateRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieLevelStateRepository } from './DexieLevelStateRepository';
import { makeLevelState } from './testing/fixtures';
import { levelStateRepositoryContract } from './testing/levelStateRepositoryContract';

levelStateRepositoryContract(
	'InMemoryLevelStateRepository',
	() => new InMemoryLevelStateRepository()
);
levelStateRepositoryContract(
	'DexieLevelStateRepository',
	() => new DexieLevelStateRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieLevelStateRepository', () => {
	it('stores one row per exercise, scope and item in the levelStates table', async () => {
		const db = createDatabase(crypto.randomUUID());
		const repo = new DexieLevelStateRepository(db);
		await repo.put(makeLevelState());
		await repo.put(makeLevelState({ level: 1 }));
		await repo.put(makeLevelState({ item: 'a' }));
		expect(await db.levelStates.count()).toBe(2);
		expect(await db.levelStates.get(['rhythm-silent-bars', '', ''])).toEqual(
			makeLevelState({ level: 1 })
		);
	});
});
