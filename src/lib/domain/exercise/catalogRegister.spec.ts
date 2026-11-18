import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { allExercises, exerciseById, exerciseSessionExercises, registerExercise } from './registry';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';

// Its own file: registering changes the live registry of the module instance.
describe('registerExercise', () => {
	it('adds an exercise to the live registry and refuses an id already taken', () => {
		const added = { ...LOCATE_NECK, id: 'registered-for-the-spec' };
		expect(registerExercise(added, 'local')).toBeNull();
		expect(registerExercise({ ...LOCATE_NECK }, 'local')).toBe('catalog');
		expect(exerciseById('registered-for-the-spec')).toBe(added);
		expect(allExercises()).toContain(added);
		expect(registerExercise(added, 'other')).toBe('local');
		expect(allExercises().filter((exercise) => exercise.id === added.id)).toHaveLength(1);
	});

	it('shows a registered figure exercise with levels to the exercise sessions', () => {
		expect(exerciseSessionExercises()).not.toContain(ARPEGGIO_EXERCISE);
		registerExercise(ARPEGGIO_EXERCISE, 'local');
		expect(exerciseSessionExercises()).toContain(ARPEGGIO_EXERCISE);
	});
});
