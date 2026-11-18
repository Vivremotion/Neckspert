import { expect, it, vi } from 'vitest';

it('starts the registries empty: only the loader fills them', async () => {
	vi.resetModules();
	const { allExercises } = await import('$lib/domain/exercise/registry');
	const { allGrids } = await import('$lib/domain/grid/registry');
	expect(allExercises()).toEqual([]);
	expect(allGrids()).toEqual([]);
});
