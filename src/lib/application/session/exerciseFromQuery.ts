import { exerciseSessionExercises } from '$lib/domain/exercise';
import type { ExerciseId } from '$lib/domain/exercise';

/**
 * `?exercise=` of /session for a session of kind `exercise`: the id of an exercise played in an
 * exercise session (`exerciseSessionExercises`), null when it is missing or names no such
 * exercise (the route then goes back home).
 */
export function exerciseFromQuery(exercise: string | null): ExerciseId | null {
	return exerciseSessionExercises().find((candidate) => candidate.id === exercise)?.id ?? null;
}
