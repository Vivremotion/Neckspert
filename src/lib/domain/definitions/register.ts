import type { ExerciseDefinition } from '$lib/domain/exercise';
import { registerExercise } from '$lib/domain/exercise/registry';
import { registerSkill } from '$lib/domain/skill/registry';
import { registerGrid } from '$lib/domain/grid/registry';
import { registerRoutine } from '$lib/domain/routine/registry';
import { routineProblem } from '$lib/domain/routine/validate';
import { readDefinitionFile, type Refusal } from './file';

/** What the application demands of an exercise beyond the format. */
export interface DefinitionChecks {
	/** The reason it is refused, without the exercise id (the refusal carries it), or null. */
	exercise(exercise: ExerciseDefinition): string | null;
}

/** An object a file registered. */
export interface Registered {
	file: string;
	kind: 'skill' | 'grid' | 'exercise' | 'routine';
	id: string;
}

/** What reading files gave: what was refused, and what was registered, in order. */
export interface RegisterResult {
	refusals: Refusal[];
	registered: Registered[];
}

/**
 * Reads definition files into the registries, the origin of an object being the key of its file.
 * Every file is read first (its reading refusals), then every file's skills are registered, then
 * every file's grids, then every file's exercises are checked and registered, then every file's
 * routines (`routineProblem`), the files in the order of their names in each pass: an exercise
 * may name a skill or a grid, a routine an exercise or a skill, of any file of the call, whatever
 * their names. A routine naming an exercise that was refused is refused. Of two objects of one id,
 * the first registered stays. A refused object is left out, the rest of its file kept. A check
 * that throws refuses its object with the error's message. Never throws.
 */
export function registerFiles(
	files: Readonly<Record<string, string>>,
	checks: DefinitionChecks
): RegisterResult {
	const refusals: Refusal[] = [];
	const registered: Registered[] = [];
	const read = Object.keys(files)
		.sort()
		.map((file) => ({ file, ...readDefinitionFile(file, files[file]) }));
	for (const each of read) refusals.push(...each.refusals);
	/** Registers an object, or refuses it naming the file that holds its id. */
	const register = (
		file: string,
		kind: 'skill' | 'grid' | 'routine',
		id: string,
		holder: string | null
	): void => {
		if (holder !== null) {
			refusals.push({ file, kind, id, reason: `this id is already defined in ${holder}` });
		} else registered.push({ file, kind, id });
	};
	for (const { file, skills } of read) {
		for (const skill of skills) register(file, 'skill', skill.id, registerSkill(skill, file));
	}
	for (const { file, grids } of read) {
		for (const grid of grids) register(file, 'grid', grid.id, registerGrid(grid, file));
	}
	for (const { file, exercises } of read) {
		for (const exercise of exercises) {
			const refusal = (reason: string): void => {
				refusals.push({ file, kind: 'exercise', id: exercise.id, reason });
			};
			let problem: string | null;
			try {
				problem = checks.exercise(exercise);
			} catch (error) {
				problem = error instanceof Error ? error.message : String(error);
			}
			if (problem !== null) {
				refusal(problem);
				continue;
			}
			const holder = registerExercise(exercise, file);
			if (holder !== null) refusal(`this id is already defined in ${holder}`);
			else registered.push({ file, kind: 'exercise', id: exercise.id });
		}
	}
	for (const { file, routines } of read) {
		for (const routine of routines) {
			let problem: string | null;
			try {
				problem = routineProblem(routine);
			} catch (error) {
				problem = error instanceof Error ? error.message : String(error);
			}
			if (problem !== null)
				refusals.push({ file, kind: 'routine', id: routine.id, reason: problem });
			else register(file, 'routine', routine.id, registerRoutine(routine, file));
		}
	}
	return { refusals, registered };
}
