import type { ExerciseDefinition } from '$lib/domain/exercise';
import { registerExercise } from '$lib/domain/exercise/registry';
import { registerGrid } from '$lib/domain/grid/registry';
import { readDefinitionFile, type Refusal } from './file';

/** What the application demands of an exercise beyond the format. */
export interface DefinitionChecks {
	/** The reason it is refused, without the exercise id (the refusal carries it), or null. */
	exercise(exercise: ExerciseDefinition): string | null;
}

/**
 * Reads definition files into the registries, the origin of an object being the key of its file.
 * Files in the order of their names; in a file, its reading refusals, then its grids, then its
 * exercises (checked once the file's grids are registered). A refused object is left out, the
 * rest of its file kept. Never throws.
 */
export function registerFiles(
	files: Readonly<Record<string, string>>,
	checks: DefinitionChecks
): Refusal[] {
	const refusals: Refusal[] = [];
	for (const file of Object.keys(files).sort()) {
		const read = readDefinitionFile(file, files[file]);
		refusals.push(...read.refusals);
		for (const grid of read.grids) {
			const holder = registerGrid(grid, file);
			if (holder !== null) {
				refusals.push({
					file,
					kind: 'grid',
					id: grid.id,
					reason: `this id is already defined in ${holder}`
				});
			}
		}
		for (const exercise of read.exercises) {
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
		}
	}
	return refusals;
}
