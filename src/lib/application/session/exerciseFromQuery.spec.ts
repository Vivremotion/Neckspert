import { describe, expect, it } from 'vitest';
import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
import { exerciseFromQuery } from './exerciseFromQuery';

describe('exerciseFromQuery', () => {
	it('gives the id of each rhythm exercise', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			expect(exerciseFromQuery(exercise.id)).toBe(exercise.id);
		}
	});

	it('gives null for a missing, unknown or non-rhythm exercise', () => {
		expect(exerciseFromQuery(null)).toBeNull();
		expect(exerciseFromQuery('')).toBeNull();
		expect(exerciseFromQuery('nope')).toBeNull();
		expect(exerciseFromQuery('locate-neck')).toBeNull();
	});
});
