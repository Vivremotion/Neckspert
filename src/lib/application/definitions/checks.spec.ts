import { beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids, registerGrid } from '$lib/domain/grid/registry';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { registerTestSkills } from '$lib/testing/testSkills';
import { definitionChecks } from './checks';

registerTestSkills();
import { LOCATE_NECK, IOHEFY_A, GESTURE_CLIMB } from '$lib/testing/catalog';

const check = (exercise: ExerciseDefinition) => definitionChecks().exercise(exercise);

describe('definitionChecks', () => {
	it('accepts every exercise of the catalog', () => {
		expect(allExercises().map((e) => [e.id, check(e)])).toEqual(
			allExercises().map((e) => [e.id, null])
		);
	});

	it('refuses a practices that names no registered skill', () => {
		expect(check({ ...LOCATE_NECK, practices: 'nope' })).toBe(
			'practices names skill "nope", which no file read so far defines'
		);
	});

	it('accepts a practices that names a registered skill', () => {
		expect(check({ ...LOCATE_NECK, practices: 'locate-note-string' })).toBeNull();
	});

	it('refuses an exercise whose skill is missing', () => {
		const { practices: _practices, ...rest } = LOCATE_NECK;
		expect(check(rest as ExerciseDefinition)).toBe('practices is missing');
	});

	it('gives the reason of the first validator that refuses, without the exercise id', () => {
		const reason = check({ ...LOCATE_NECK, tempo: -3 });
		expect(reason).toMatch(/^tempo /);
		expect(reason).not.toContain('locate-note-string');
	});

	it('refuses a presentation naming a field its set does not have', () => {
		expect(check({ ...LOCATE_NECK, presentation: { primary: '{chord}' } })).toBe(
			'presentation.primary names field "chord", which note-on-string does not have'
		);
	});

	it('refuses an exercise whose skill’s item set has no presenter', () => {
		const checks = definitionChecks({}, {});
		expect(checks.exercise(LOCATE_NECK)).toBe(
			'practices a skill whose item set "note-on-string" has no presenter'
		);
	});

	it('refuses an item its round cannot compile', () => {
		// A key alone, where the round reads the length of its item.
		const far = { ...ARPEGGIO_EXERCISE, id: 'far', items: ['C|maj|3:1,2:3,1:5@5-5-3'] };
		expect(check(far)).toMatch(/^items\[0\] .*does not compile at exercise level -1/);
	});

	it('refuses a view the screen cannot draw', () => {
		expect(check({ ...ARPEGGIO_EXERCISE, id: 'three', view: 'score' })).toMatch(
			/^view "score" is not a view/
		);
	});

	describe('grids', () => {
		beforeEach(() => {
			clearExercises();
			clearGrids();
		});

		it('refuses a grid no file read so far defines', () => {
			clearGrids();
			const link = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['nowhere'] } };
			expect(check(link)).toBe(
				'params.grids names grid "nowhere", which no file read so far defines'
			);
		});

		it('refuses a grid no file defines for any exercise that names grids, gesture or not', () => {
			const other = {
				...ARPEGGIO_EXERCISE,
				id: 'other',
				params: { ...ARPEGGIO_EXERCISE.params, grids: ['nowhere'] }
			};
			expect(check(other)).toBe(
				'params.grids names grid "nowhere", which no file read so far defines'
			);
		});

		it('accepts a grid a file defines', () => {
			registerGrid(IOHEFY_A, 'a.json');
			const climb = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['iohefy-a'] } };
			expect(check(climb)).toBeNull();
		});
	});
});
