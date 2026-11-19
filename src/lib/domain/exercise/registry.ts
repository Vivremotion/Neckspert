import { writesFigure } from './figureParams';
import type { ExerciseDefinition, ExerciseId } from './types';

/** The live exercises, with the origin (file) that defined each; empty until files are read. */
const registered = new Map<ExerciseId, { exercise: ExerciseDefinition; origin: string }>();

/** Null: registered. Else the origin that already holds this id; nothing changes. */
export function registerExercise(exercise: ExerciseDefinition, origin: string): string | null {
	const known = registered.get(exercise.id);
	if (known) return known.origin;
	registered.set(exercise.id, { exercise, origin });
	return null;
}

export function allExercises(): readonly ExerciseDefinition[] {
	return [...registered.values()].map((entry) => entry.exercise);
}

/** The exercise of `id`, or nothing when no file defines it (a removed file keeps its progress). */
export function findExercise(id: ExerciseId): ExerciseDefinition | undefined {
	return registered.get(id)?.exercise;
}

/** How the error of an exercise the registry does not hold begins (`exerciseById`). */
export const UNKNOWN_EXERCISE = 'Unknown exercise: ';

export function exerciseById(id: ExerciseId): ExerciseDefinition {
	const found = registered.get(id);
	if (found) return found.exercise;
	throw new Error(
		`${UNKNOWN_EXERCISE}${id}${registered.size === 0 ? ' (no definition is loaded)' : ''}`
	);
}

/**
 * The exercises played in an exercise session, in registry order: those whose round writes a
 * figure and that write levels. Read from the live registry at each call.
 */
export function exerciseSessionExercises(): readonly ExerciseDefinition[] {
	return allExercises().filter(
		(exercise) => writesFigure(exercise) && (exercise.levels?.length ?? 0) > 0
	);
}

export function clearExercises(): void {
	registered.clear();
}
