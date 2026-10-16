import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
import type { ExerciseId } from '$lib/domain/exercise';

/**
 * `?exercise=` of /session for a session of kind `exercise`: the id of a rhythm exercise,
 * null when it is missing or names no such exercise (the route then goes back home).
 */
export function exerciseFromQuery(exercise: string | null): ExerciseId | null {
	return RHYTHM_EXERCISES.find((candidate) => candidate.id === exercise)?.id ?? null;
}
