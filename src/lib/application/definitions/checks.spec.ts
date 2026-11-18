import { beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { LOCATE_NECK } from '$lib/domain/exercise/catalog';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { IOHEFY_A } from '$lib/domain/grid/catalog';
import { clearGrids, registerGrid } from '$lib/domain/grid/registry';
import { GESTURE_CLIMB } from '$lib/domain/gesture/exercises';
import { definitionChecks } from './checks';

const check = (exercise: ExerciseDefinition) => definitionChecks().exercise(exercise);

describe('definitionChecks', () => {
	it('accepts every exercise of the catalog', () => {
		expect(allExercises().map((e) => [e.id, check(e)])).toEqual(
			allExercises().map((e) => [e.id, null])
		);
	});

	it('refuses an unknown mechanic', () =>
		expect(check({ ...LOCATE_NECK, mechanic: 'nope' })).toBe('mechanic "nope" is unknown'));

	it('gives the reason of the first validator that refuses', () => {
		const reason = check({ ...LOCATE_NECK, tempo: -3 });
		expect(reason).toContain('tempo');
		expect(reason).toContain('locate-neck');
	});

	describe('grids', () => {
		beforeEach(() => {
			clearExercises();
			clearGrids();
		});

		it('refuses a grid no file defines', () => {
			clearGrids();
			const link = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['nowhere'] } };
			expect(check(link)).toBe('params.grids names grid "nowhere", which no file defines');
		});

		it('accepts a grid a file defines', () => {
			registerGrid(IOHEFY_A, 'a.json');
			const climb = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['iohefy-a'] } };
			expect(check(climb)).toBeNull();
		});
	});
});
