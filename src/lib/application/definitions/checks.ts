import { MECHANIC_PRESENTERS } from '$lib/application/mechanics';
import type { MechanicPresenter } from '$lib/application/mechanics';
import {
	presentationProblem,
	previewProblem,
	screenProblem
} from '$lib/application/presentation/validate';
import type { DefinitionChecks } from '$lib/domain/definitions';
import { validateExercise } from '$lib/domain/exercise';
import { hasSkill } from '$lib/domain/skill/registry';
import { mechanicOfSkill } from '$lib/domain/skill/bridge';
import { CHANGE_SKILL_IDS } from '$lib/domain/exercise/catalogIds';
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
			if (typeof exercise.practices !== 'string' || exercise.practices === '') {
				return 'practices is missing';
			}
			if (!hasSkill(exercise.practices)) {
				return `practices names skill "${exercise.practices}", which no file read so far defines`;
			}
			const mechanic = mechanicOfSkill(exercise.practices);
			if (!Object.hasOwn(presenters, mechanic)) {
				return `skill "${exercise.practices}" is played by no presenter (${mechanic})`;
			}
			const problem =
				validateExercise(exercise, { sensors: SESSION_SENSORS }) ??
				presentationProblem(exercise) ??
				screenProblem(exercise, presenters) ??
				previewProblem(exercise, presenters);
			if (problem !== null) {
				// The validators name the exercise; a refusal carries its id apart.
				const prefix = `${exercise.id}: `;
				return problem.startsWith(prefix) ? problem.slice(prefix.length) : problem;
			}
			if ((CHANGE_SKILL_IDS as readonly string[]).includes(exercise.practices)) {
				const known = new Set(allGrids().map((grid) => grid.id));
				for (const id of readGestureParams(exercise).grids ?? []) {
					if (!known.has(id))
						return `params.grids names grid "${id}", which no file read so far defines`;
				}
			}
			return null;
		}
	};
}
