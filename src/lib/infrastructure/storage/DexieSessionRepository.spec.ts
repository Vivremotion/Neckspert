import 'fake-indexeddb/auto';
import { InMemorySessionRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieSessionRepository } from './DexieSessionRepository';
import { sessionRepositoryContract } from './testing/sessionRepositoryContract';

sessionRepositoryContract('InMemorySessionRepository', () => new InMemorySessionRepository());
sessionRepositoryContract(
	'DexieSessionRepository',
	() => new DexieSessionRepository(createDatabase(crypto.randomUUID()))
);
