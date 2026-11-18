import { describe, expect, it } from 'vitest';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions/register';
import { allExercises, clearExercises } from '$lib/domain/exercise';
import { allGrids, clearGrids } from '$lib/domain/grid';
import { CATALOG_FILES } from './catalogFiles';

function load() {
	clearExercises();
	clearGrids();
	return registerFiles(CATALOG_FILES, definitionChecks());
}

describe('the catalog files', () => {
	it('holds the four files', () => {
		expect(Object.keys(CATALOG_FILES).sort()).toEqual([
			'/catalog/changes.json',
			'/catalog/chords.json',
			'/catalog/notes.json',
			'/catalog/rhythm.json'
		]);
	});

	it('loads without a single refusal', () => {
		expect(load()).toEqual([]);
		expect(allExercises()).toHaveLength(11);
		expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
	});
});
