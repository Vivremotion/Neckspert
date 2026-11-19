import { findExercise } from '$lib/domain/exercise/registry';
import { findRoutine } from '$lib/domain/routine/registry';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SessionOrigin } from '$lib/domain/types';
import type { ExerciseId } from '$lib/domain/exercise/types';
import type { PlayOrigin, PlayWords } from './contract';

/**
 * How the play screen names what a session plays (D10): the routine's title and how-to, or the
 * exercise's own title when it is played alone (its skill's name when it writes none); what no
 * file defines any more, by its id.
 */
export function playOriginOf(origin: SessionOrigin): PlayOrigin {
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
	return { title: exerciseTitle(origin.exercise), howTo: null, free, alone: true };
}

/** An exercise's name on the play screen: its title, else its skill's name, else its id. */
export function exerciseTitle(exerciseId: ExerciseId): PlayWords {
	const exercise = findExercise(exerciseId);
	const skill =
		exercise && hasSkill(exercise.practices) ? skillById(exercise.practices).name : undefined;
	return exercise?.title ?? skill ?? { fr: exerciseId, en: exerciseId };
}
