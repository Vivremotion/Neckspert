import type { ExerciseId } from '$lib/domain/exercise/types';
import type { SkillId } from '$lib/domain/skill/types';
import type { Opening } from './types';

/** What the player knows, as an opening reads it. */
export interface Known {
	/** Cards acquired, by skill. */
	acquired(skill: SkillId): number;
	/** The level an (exercise, scope) holds, 1 for level 1; null when it holds none. */
	level(exercise: ExerciseId, scope: string | undefined): number | null;
}

/** Whether an opening holds on what the player knows; a routine without one is open. */
export function opened(opening: Opening | undefined, known: Known): boolean {
	if (opening === undefined) return true;
	if ('acquired' in opening) {
		return known.acquired(opening.acquired.skill) >= opening.acquired.atLeast;
	}
	if ('level' in opening) {
		const { exercise, scope, atLeast } = opening.level;
		const level = known.level(exercise, scope);
		return level !== null && level >= atLeast;
	}
	if ('all' in opening) return opening.all.every((term) => opened(term, known));
	return opening.any.some((term) => opened(term, known));
}
