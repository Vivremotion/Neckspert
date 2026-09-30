import 'fake-indexeddb/auto';
import { InMemoryCardStateRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { cardStateRepositoryContract } from './testing/cardStateRepositoryContract';

cardStateRepositoryContract('InMemoryCardStateRepository', () => new InMemoryCardStateRepository());
cardStateRepositoryContract(
	'DexieCardStateRepository',
	() => new DexieCardStateRepository(createDatabase(crypto.randomUUID()))
);
