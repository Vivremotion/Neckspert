import type { ExerciseId } from '$lib/domain/exercise/types';
import type { SkillId } from '$lib/domain/skill/types';

/** An entry of the home screen, written in a definition file: the exercises it plays together. */
export interface RoutineDefinition {
	id: string;
	title: { fr: string; en: string };
	/** In the order they introduce (memory) or take turns (passages). */
	exercises: ExerciseId[];
	/** Told on the start screen when the first exercise played tells none. */
	howTo?: { fr: string; en: string };
	opens?: Opening;
}

/** When a routine opens: a predicate over what the player acquired and reached. */
export type Opening =
	| { acquired: { skill: SkillId; atLeast: number } }
	| { level: { exercise: ExerciseId; scope?: string; atLeast: number } }
	| { all: Opening[] }
	| { any: Opening[] };

export const MAX_ROUTINE_EXERCISES = 32;
/** Every node of the predicate counted. */
export const MAX_OPENING_TERMS = 16;
/** The outermost node is at depth 1. */
export const MAX_OPENING_DEPTH = 4;
