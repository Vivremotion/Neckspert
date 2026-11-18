import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE as A } from '$lib/testing/arpeggioExercise';
import {
	allExercises,
	clearExercises,
	exerciseById,
	exerciseSessionExercises,
	registerExercise
} from './registry';

describe('the exercise registry', () => {
	it('holds the catalog the test setup loads', () => {
		expect(exerciseById('locate-neck').id).toBe('locate-neck');
		expect(allExercises().length).toBeGreaterThan(0);
	});

	it('registers an exercise once', () => {
		clearExercises();
		expect(registerExercise(A, 'a.json')).toBeNull();
		expect(registerExercise({ ...A }, 'b.json')).toBe('a.json');
		expect(allExercises()).toEqual([A]);
	});

	it('says that nothing is loaded when the registry is empty', () => {
		clearExercises();
		expect(() => exerciseById('x')).toThrow('Unknown exercise: x (no definition is loaded)');
	});

	it('names an unknown exercise', () => {
		clearExercises();
		registerExercise(A, 'a.json');
		expect(() => exerciseById('x')).toThrow('Unknown exercise: x');
		expect(() => exerciseById('x')).not.toThrow('no definition');
	});

	it('shows a registered figure exercise with levels to the exercise sessions', () => {
		clearExercises();
		expect(exerciseSessionExercises()).not.toContain(A);
		registerExercise(A, 'a.json');
		expect(exerciseSessionExercises()).toContain(A);
	});
});
