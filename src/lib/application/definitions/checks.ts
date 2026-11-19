import { findPresenter, SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import type { SetPresenter } from '$lib/application/sets';
import {
	presentationProblem,
	previewProblem,
	screenProblem
} from '$lib/application/presentation/validate';
import type { DefinitionChecks } from '$lib/domain/definitions';
import { validateExercise } from '$lib/domain/exercise';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import { allGrids } from '$lib/domain/grid/registry';

/** The sensors a session has (the keys of `SessionDeps.sensors` in `createApp`). */
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];

/** What the application demands of an exercise, over what the format says. */
export function definitionChecks(
	presenters: Readonly<Record<string, SetPresenter>> = SET_PRESENTERS,
	views: Readonly<Record<string, SetPresenter>> = VIEW_PRESENTERS
): DefinitionChecks {
	return {
		exercise(exercise) {
			if (typeof exercise.practices !== 'string' || exercise.practices === '') {
				return 'practices is missing';
			}
			if (!hasSkill(exercise.practices)) {
				return `practices names skill "${exercise.practices}", which no file read so far defines`;
			}
			if (!findPresenter(exercise, presenters, views)) {
				const set = skillById(exercise.practices).items;
				return `practices a skill whose item set "${set}" has no presenter`;
			}
			const problem =
				validateExercise(exercise, { sensors: SESSION_SENSORS }) ??
				presentationProblem(exercise) ??
				screenProblem(exercise, { presenters, views }) ??
				previewProblem(exercise, { presenters, views });
			if (problem !== null) {
				// The validators name the exercise; a refusal carries its id apart.
				const prefix = `${exercise.id}: `;
				return problem.startsWith(prefix) ? problem.slice(prefix.length) : problem;
			}
			// Any exercise that names grids: each must be defined by a file read so far.
			const grids = (exercise.params as { grids?: unknown } | undefined)?.grids;
			if (Array.isArray(grids)) {
				const known = new Set(allGrids().map((grid) => grid.id));
				for (const id of grids) {
					if (!known.has(id))
						return `params.grids names grid "${id}", which no file read so far defines`;
				}
			}
			return null;
		}
	};
}
