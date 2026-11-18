import { MECHANIC_PRESENTERS } from '$lib/application/mechanics';
import type { MechanicPresenter } from '$lib/application/mechanics';
import {
	presentationProblem,
	previewProblem,
	screenProblem
} from '$lib/application/presentation/validate';
import type { DefinitionChecks } from '$lib/domain/definitions';
import { validateExercise } from '$lib/domain/exercise';
import { allGrids } from '$lib/domain/grid/registry';
import { readGestureParams } from '$lib/domain/gesture/exercises';

/** The sensors a session has (the keys of `SessionDeps.sensors` in `createApp`). */
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];

/** What the application demands of an exercise, over what the format says. */
export function definitionChecks(
	presenters: Readonly<Record<string, MechanicPresenter>> = MECHANIC_PRESENTERS
): DefinitionChecks {
	return {
		exercise(exercise) {
			if (!Object.hasOwn(presenters, exercise.mechanic)) {
				return `mechanic "${exercise.mechanic}" is unknown`;
			}
			const problem =
				validateExercise(exercise, { sensors: SESSION_SENSORS }) ??
				presentationProblem(exercise) ??
				screenProblem(exercise, presenters) ??
				previewProblem(exercise, presenters);
			if (problem !== null) return problem;
			if (exercise.mechanic === 'chord-grid') {
				const known = new Set(allGrids().map((grid) => grid.id));
				for (const id of readGestureParams(exercise).grids ?? []) {
					if (!known.has(id)) return `params.grids names grid "${id}", which no file defines`;
				}
			}
			return null;
		}
	};
}
