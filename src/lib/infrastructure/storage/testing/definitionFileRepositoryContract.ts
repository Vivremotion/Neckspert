import { beforeEach, describe, expect, it } from 'vitest';
import type { DefinitionFileRecord, DefinitionFileRepositoryPort } from '$lib/application/ports';

function file(name: string, overrides: Partial<DefinitionFileRecord> = {}): DefinitionFileRecord {
	return {
		name,
		text: `{ "format": 0, "grids": [], "exercises": [] }`,
		importedAt: 1000,
		...overrides
	};
}

/** Behaviour shared by every DefinitionFileRepositoryPort implementation. */
export function definitionFileRepositoryContract(
	name: string,
	create: () => DefinitionFileRepositoryPort
): void {
	describe(`${name} honours DefinitionFileRepositoryPort`, () => {
		let repo: DefinitionFileRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('lists the files it was given by name', async () => {
			await repo.put(file('triads.json'));
			await repo.put(file('arpeggios.json', { importedAt: 2000 }));
			await repo.put(file('blues.json'));
			expect((await repo.all()).map((stored) => stored.name)).toEqual([
				'arpeggios.json',
				'blues.json',
				'triads.json'
			]);
			expect(await repo.all()).toContainEqual(file('arpeggios.json', { importedAt: 2000 }));
		});

		it('replaces the file of the same name', async () => {
			await repo.put(file('triads.json'));
			const next = file('triads.json', { text: '{}', importedAt: 3000 });
			await repo.put(next);
			expect(await repo.all()).toEqual([next]);
		});

		it('deletes a file by its name, and ignores a name it does not hold', async () => {
			await repo.put(file('triads.json'));
			await repo.put(file('blues.json'));
			await repo.delete('triads.json');
			await repo.delete('nowhere.json');
			expect(await repo.all()).toEqual([file('blues.json')]);
		});

		it('keeps its own copy of what it was given', async () => {
			const given = file('triads.json');
			await repo.put(given);
			given.text = 'changed';
			expect((await repo.all())[0].text).not.toBe('changed');
		});
	});
}
