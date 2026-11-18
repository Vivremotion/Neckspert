import { beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids, registerGrid } from '$lib/domain/grid/registry';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { definitionChecks } from './checks';
import { LOCATE_NECK, IOHEFY_A, GESTURE_CLIMB } from '$lib/testing/catalog';

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

	it('refuses a presentation naming a field its mechanic does not have', () => {
		expect(check({ ...LOCATE_NECK, presentation: { primary: '{chord}' } })).toBe(
			'locate-neck: presentation.primary names field "chord", which locate does not have'
		);
	});

	it('refuses an item its round cannot compile', () => {
		const far = { ...ARPEGGIO_EXERCISE, id: 'far', items: ['C|maj|3:1,2:3,1:5@9@4'] };
		expect(check(far)).toMatch(/^far: items\[0\] .*does not compile at exercise level -1/);
	});

	it('refuses a view the screen cannot draw', () => {
		expect(check({ ...ARPEGGIO_EXERCISE, id: 'three', view: 'score' })).toContain(
			'three: view "score" is not a view'
		);
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
