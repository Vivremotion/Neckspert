import { describe, expect, it } from 'vitest';
import { exerciseSessionExercises, RHYTHM_EXERCISES } from '$lib/domain/exercise';
import { exerciseFromQuery } from './exerciseFromQuery';

describe('exerciseFromQuery', () => {
	it('gives the id of each exercise of an exercise session, the rhythm’s among them', () => {
		expect(exerciseSessionExercises()).toEqual(expect.arrayContaining([...RHYTHM_EXERCISES]));
		for (const exercise of exerciseSessionExercises()) {
			expect(exerciseFromQuery(exercise.id)).toBe(exercise.id);
		}
	});

	it('gives null for a missing or unknown exercise, or one not played on its own', () => {
		expect(exerciseFromQuery(null)).toBeNull();
		expect(exerciseFromQuery('')).toBeNull();
		expect(exerciseFromQuery('nope')).toBeNull();
		expect(exerciseFromQuery('locate-neck')).toBeNull();
	});
});
