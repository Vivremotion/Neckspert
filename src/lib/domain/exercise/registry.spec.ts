import { registerTestSkills, TEST_NOTE_SKILL } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE as A } from '$lib/testing/arpeggioExercise';
import {
	allExercises,
	clearExercises,
	exerciseById,
	exerciseSessionExercises,
	findExercise,
	registerExercise,
	servesExerciseSession
} from './registry';
import type { ExerciseDefinition } from './types';

registerTestSkills();

describe('the exercise registry', () => {
	it('holds the catalog the test setup loads', () => {
		expect(exerciseById('locate-note-string').id).toBe('locate-note-string');
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

	it('finds a registered exercise, and nothing for an id no file defines', () => {
		clearExercises();
		registerExercise(A, 'a.json');
		expect(findExercise(A.id)).toBe(A);
		expect(findExercise('x')).toBeUndefined();
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

	it('leaves out of the exercise sessions an exercise on a skill with cards', () => {
		clearExercises();
		const onCards = { ...A, id: 'memory-with-figure', practices: TEST_NOTE_SKILL.id };
		registerExercise(A, 'a.json');
		registerExercise(onCards, 'b.json');
		expect(exerciseSessionExercises()).toContain(A);
		expect(exerciseSessionExercises()).not.toContain(onCards);
	});

	it('leaves out what the exercise session cannot serve: no items and no figure read on its items', () => {
		clearExercises();
		const { items: _items, ...noItems } = A;
		const unserved = { ...noItems, id: 'no-items' };
		registerExercise(unserved, 'a.json');
		expect(exerciseSessionExercises()).not.toContain(unserved);
		expect(servesExerciseSession(unserved)).toBe(false);
		expect(servesExerciseSession(A)).toBe(true);
	});

	it('leaves out an exercise that writes passages: no session plays an imported file’s passages yet', () => {
		clearExercises();
		const { items: _items, ...noItems } = A;
		const withPassages: ExerciseDefinition = {
			...noItems,
			id: 'with-passages',
			passages: {
				of: { chord: ['C'], strings: [[3, 2, 1]] },
				members: { family: 'chord-shapes', order: ['position'], take: 4 }
			}
		} as ExerciseDefinition;
		registerExercise(withPassages, 'a.json');
		registerExercise({ ...withPassages, id: 'with-both', items: A.items }, 'b.json');
		expect(exerciseSessionExercises()).toEqual([]);
	});
});
