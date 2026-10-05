import 'fake-indexeddb/auto';
import { InMemoryProgressionRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieProgressionRepository } from './DexieProgressionRepository';
import { progressionRepositoryContract } from './testing/progressionRepositoryContract';

progressionRepositoryContract(
	'InMemoryProgressionRepository',
	() => new InMemoryProgressionRepository()
);
progressionRepositoryContract(
	'DexieProgressionRepository',
	() => new DexieProgressionRepository(createDatabase(crypto.randomUUID()))
);
