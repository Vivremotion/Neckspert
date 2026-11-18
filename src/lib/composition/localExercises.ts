import { MECHANIC_PRESENTERS } from '$lib/application/mechanics';
import type { MechanicPresenter } from '$lib/application/mechanics';
import { definitionChecks } from '$lib/application/definitions/checks';
import {
	allExercises,
	exerciseFromJson,
	registerExercise,
	type ExerciseDefinition
} from '$lib/domain/exercise';

export interface LocalExercises {
	loaded: ExerciseDefinition[];
	refused: { file: string; reason: string }[];
}

export interface LocalExercisesOptions {
	/** The presenters of the mechanics the application plays; absent: all of them. */
	presenters?: Readonly<Record<string, MechanicPresenter>>;
}

/**
 * Parses each file's text as JSON, validates it (`validateExercise`, `presentationProblem`,
 * `screenProblem`, `previewProblem`) and keeps the valid ones, by file name; a file that does not
 * hold a runnable exercise, its JSON unreadable included, is refused with the reason, never
 * thrown. An id already in the catalog, or used by an earlier local file, is refused. Registers
 * nothing: see `loadLocalExercises`.
 */
export function readLocalExercises(
	files: Record<string, string>,
	options: LocalExercisesOptions = {}
): LocalExercises {
	const checks = definitionChecks(options.presenters ?? MECHANIC_PRESENTERS);
	const result: LocalExercises = { loaded: [], refused: [] };
	const used = new Set<string>(allExercises().map((exercise) => exercise.id));
	for (const file of Object.keys(files).sort()) {
		const reason = ((): string | null => {
			try {
				let json: unknown;
				try {
					json = JSON.parse(files[file]);
				} catch (error) {
					return `the file is not JSON: ${(error as Error).message}`;
				}
				const exercise = exerciseFromJson(json);
				const { id } = exercise;
				if (used.has(id)) {
					return result.loaded.some((loaded) => loaded.id === id)
						? `${id}: this id is already used by another local file`
						: `${id}: this id is already in the catalog`;
				}
				const problem = checks.exercise(exercise);
				if (problem !== null) return problem.startsWith(`${id}: `) ? problem : `${id}: ${problem}`;
				used.add(id);
				result.loaded.push(exercise);
				return null;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		})();
		if (reason !== null) result.refused.push({ file, reason });
	}
	return result;
}

let local: LocalExercises | null = null;

/**
 * Reads the local files once, registers the valid ones in the catalog, and reports each refused
 * file with `console.error`. Called again, it returns what the first call read.
 */
export function loadLocalExercises(files: Record<string, string>): LocalExercises {
	if (local) return local;
	local = readLocalExercises(files);
	for (const exercise of local.loaded) registerExercise(exercise, 'exercises.local');
	for (const { file, reason } of local.refused) {
		console.error(`[exercises.local] ${file} refused: ${reason}`);
	}
	return local;
}

/** The local files refused by `loadLocalExercises`, none before it ran. */
export function refusedLocalExercises(): readonly LocalExercises['refused'][number][] {
	return local?.refused ?? [];
}
