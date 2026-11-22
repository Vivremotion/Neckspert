import { findExercise } from '$lib/domain/exercise/registry';
import { findRoutine } from '$lib/domain/routine/registry';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SessionOrigin } from '$lib/domain/types';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import type { PlayOrigin, PlayWords } from './contract';

/** Finds an exercise by its id, `undefined` for one it does not know. */
export type ExerciseLookup = (id: ExerciseId) => ExerciseDefinition | undefined;

/**
 * How the play screen names what a session plays (D10): the routine's title and how-to, or the
 * exercise's own title when it is played alone (its skill's name when it writes none); what no
 * file defines any more, by its id. The exercise is read through `exercise` (the registry by
 * default).
 */
export function playOriginOf(
	origin: SessionOrigin,
	exercise: ExerciseLookup = findExercise
): PlayOrigin {
	const free = origin.free === true;
	if ('routine' in origin) {
		const routine = findRoutine(origin.routine);
		return {
			title: routine?.title ?? { fr: origin.routine, en: origin.routine },
			howTo: routine?.howTo ?? null,
			free,
			alone: false
		};
	}
	return { title: exerciseTitle(origin.exercise, exercise), howTo: null, free, alone: true };
}

/** An exercise's name on the play screen: its title, else its skill's name, else its id. */
export function exerciseTitle(
	exerciseId: ExerciseId,
	lookUp: ExerciseLookup = findExercise
): PlayWords {
	const exercise = lookUp(exerciseId);
	const skill =
		exercise && hasSkill(exercise.practices) ? skillById(exercise.practices).name : undefined;
	return exercise?.title ?? skill ?? { fr: exerciseId, en: exerciseId };
}
