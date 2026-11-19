import { findExercise } from '$lib/domain/exercise/registry';
import { hasCards, hasSkill } from '$lib/domain/skill/registry';
import type { Opening, RoutineDefinition } from './types';

/** The first problem of what the opening names, read in the registries, or null. */
function openingProblem(opening: Opening, where: string): string | null {
	if ('acquired' in opening) {
		const { skill } = opening.acquired;
		return hasSkill(skill) ? null : `${where}.acquired.skill: no file defines the skill "${skill}"`;
	}
	if ('level' in opening) {
		const { exercise } = opening.level;
		return findExercise(exercise)
			? null
			: `${where}.level.exercise: no file defines the exercise "${exercise}"`;
	}
	const [form, terms] = 'all' in opening ? ['all', opening.all] : ['any', opening.any];
	for (const [index, term] of terms.entries()) {
		const problem = openingProblem(term, `${where}.${form}[${index}]`);
		if (problem !== null) return problem;
	}
	return null;
}

/**
 * What makes a routine unplayable, read in the registries, the field named; null when it can be
 * played. Its shape is `routineFromJson`'s: here, each exercise is defined; the exercises all
 * practise skills with memory or all without; no two practise one skill; one without memory
 * writes `passages`; the opening names only skills and exercises defined.
 */
export function routineProblem(routine: RoutineDefinition): string | null {
	if (routine.exercises.length === 0) return 'exercises is empty';
	const exercises = [];
	for (const [index, id] of routine.exercises.entries()) {
		const exercise = findExercise(id);
		if (!exercise) return `exercises[${index}]: no file defines the exercise "${id}"`;
		exercises.push(exercise);
	}
	const memory = hasCards(exercises[0].practices);
	const practised = new Map<string, number>();
	for (const [index, exercise] of exercises.entries()) {
		if (hasCards(exercise.practices) !== memory) {
			const [its, first] = memory ? ['without', 'with'] : ['with', 'without'];
			return `exercises[${index}] practises a skill ${its} memory, exercises[0] one ${first} memory: a routine does not mix them`;
		}
		const before = practised.get(exercise.practices);
		if (before !== undefined) {
			return `exercises[${index}] practises the skill "${exercise.practices}", as exercises[${before}] does`;
		}
		practised.set(exercise.practices, index);
		if (!memory && exercise.passages === undefined) {
			return `exercises[${index}]: "${exercise.id}" practises a skill without memory and writes no passages`;
		}
	}
	return routine.opens === undefined ? null : openingProblem(routine.opens, 'opens');
}
