// A removed definition file empties the registries of its objects: no page or layout may read
// one when its module loads, or the app would not open at all.
// Its limit: a module is evaluated once per test file. The ones the setup file
// (`src/lib/testing/setup.ts`) and this spec's own static imports have already evaluated, with
// the registries full, are not evaluated again here with them empty: a read at load in one of
// those would go unseen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
import { clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids } from '$lib/domain/grid/registry';
import { clearSkills } from '$lib/domain/skill/registry';

const ROUTE_MODULES = import.meta.glob(['./**/+page.svelte', './**/+layout.svelte']);

function clearRegistries(): void {
	clearExercises();
	clearGrids();
	clearSkills();
}

describe('every route module with the registries empty', () => {
	beforeAll(clearRegistries);
	afterAll(() => {
		clearRegistries();
		loadDefinitions({ catalog: CATALOG_FILES });
	});

	it('finds the route modules', () => {
		expect(Object.keys(ROUTE_MODULES).length).toBeGreaterThan(10);
	});

	for (const [path, load] of Object.entries(ROUTE_MODULES)) {
		it(`imports ${path}`, async () => {
			const module = (await load()) as { default?: unknown };
			expect(module.default).toBeDefined();
		});
	}
});
