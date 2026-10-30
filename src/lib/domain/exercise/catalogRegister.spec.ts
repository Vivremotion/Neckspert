import { describe, expect, it } from 'vitest';
import {
	EXERCISES,
	LOCATE_NECK,
	exerciseById,
	exerciseSessionExercises,
	registerExercises
} from './catalog';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';

// Its own file: registering changes the live catalog of the module instance.
describe('registerExercises', () => {
	it('adds exercises to the live catalog and refuses an id already taken', () => {
		const added = { ...LOCATE_NECK, id: 'registered-for-the-spec' };
		const first = registerExercises([added, { ...LOCATE_NECK }]);
		expect(first).toEqual({ registered: ['registered-for-the-spec'], taken: ['locate-neck'] });
		expect(exerciseById('registered-for-the-spec')).toBe(added);
		expect(EXERCISES).toContain(added);
		expect(registerExercises([added]).taken).toEqual(['registered-for-the-spec']);
		expect(EXERCISES.filter((exercise) => exercise.id === added.id)).toHaveLength(1);
	});

	it('shows a registered figure exercise with levels to the exercise sessions', () => {
		expect(exerciseSessionExercises()).not.toContain(ARPEGGIO_EXERCISE);
		registerExercises([ARPEGGIO_EXERCISE]);
		expect(exerciseSessionExercises()).toContain(ARPEGGIO_EXERCISE);
	});
});
