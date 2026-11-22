import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { InMemoryDefinitionFileRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieDefinitionFileRepository } from './DexieDefinitionFileRepository';
import { definitionFileRepositoryContract } from './testing/definitionFileRepositoryContract';

definitionFileRepositoryContract(
	'InMemoryDefinitionFileRepository',
	() => new InMemoryDefinitionFileRepository()
);
definitionFileRepositoryContract(
	'DexieDefinitionFileRepository',
	() => new DexieDefinitionFileRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieDefinitionFileRepository', () => {
	it('stores one row per name in the definitionFiles table', async () => {
		const db = createDatabase(crypto.randomUUID());
		const repo = new DexieDefinitionFileRepository(db);
		await repo.put({ name: 'a.json', text: 'x', importedAt: 1 });
		await repo.put({ name: 'a.json', text: 'y', importedAt: 2 });
		expect(await db.definitionFiles.count()).toBe(1);
		expect(await db.definitionFiles.get('a.json')).toEqual({
			name: 'a.json',
			text: 'y',
			importedAt: 2
		});
	});
});
