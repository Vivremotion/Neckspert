import { findExercise } from '$lib/domain/exercise/registry';
import { findRoutine } from '$lib/domain/routine/registry';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SessionOrigin } from '$lib/domain/types';
import type { PlayOrigin } from './contract';

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
	const exercise = findExercise(origin.exercise);
	const skill =
		exercise && hasSkill(exercise.practices) ? skillById(exercise.practices).name : undefined;
	return {
		title: exercise?.title ?? skill ?? { fr: origin.exercise, en: origin.exercise },
		howTo: null,
		free,
		alone: true
	};
}
