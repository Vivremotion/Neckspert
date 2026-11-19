import { hasCards } from '$lib/domain/skill/registry';
import { METER_4_4 } from '$lib/domain/time';
import { writesFigure } from './figureParams';
import { figureItemsAt } from './round';
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
 * Whether an exercise session can serve the exercise's turns (`createExerciseItemSource`): the
 * items it writes, else the figures its round reads on its items. An exercise that writes
 * `passages` is never one: no session plays an imported file's passages yet.
 */
export function servesExerciseSession(exercise: ExerciseDefinition): boolean {
	if (exercise.passages !== undefined) return false;
	if (exercise.items !== undefined) return exercise.items.length > 0;
	return figureItemsAt(exercise, 0, exercise.meter ?? METER_4_4) !== null;
}

/**
 * Whether an exercise session plays the exercise: its round writes a figure, it writes levels and
 * its turns the session can serve (`servesExerciseSession`), on a skill without cards. An exercise
 * on a skill with cards is played alone freely among its items instead.
 */
export function playsInExerciseSession(exercise: ExerciseDefinition): boolean {
	return (
		writesFigure(exercise) &&
		(exercise.levels?.length ?? 0) > 0 &&
		!hasCards(exercise.practices) &&
		servesExerciseSession(exercise)
	);
}

/** The exercises played in an exercise session (`playsInExerciseSession`), in registry order. */
export function exerciseSessionExercises(): readonly ExerciseDefinition[] {
	return allExercises().filter(playsInExerciseSession);
}

/**
 * How an exercise is played alone (`startExercise`): `memory`, a memory exercise freely among the
 * items it lists; `passages`, on its passages; `cycles`, as an exercise session plays it; null
 * when nothing can serve it alone.
 */
export type AloneSource = 'memory' | 'passages' | 'cycles';

export function aloneSourceOf(exercise: ExerciseDefinition): AloneSource | null {
	if (hasCards(exercise.practices) && (exercise.items ?? []).length > 0) return 'memory';
	if (exercise.passages !== undefined) return 'passages';
	return playsInExerciseSession(exercise) ? 'cycles' : null;
}

export function clearExercises(): void {
	registered.clear();
}
