import type { ExerciseDefinition, ExerciseId } from './types';

export const LOCATE_NECK: ExerciseDefinition = {
	id: 'locate-neck',
	version: 1,
	mechanic: 'locate',
	params: {}
};

export const IDENTIFY_NECK: ExerciseDefinition = {
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	params: {}
};

export const EXERCISES: readonly ExerciseDefinition[] = [LOCATE_NECK, IDENTIFY_NECK];

export function exerciseById(id: ExerciseId): ExerciseDefinition {
	const found = EXERCISES.find((exercise) => exercise.id === id);
	if (!found) throw new Error(`Unknown exercise: ${id}`);
	return found;
}
