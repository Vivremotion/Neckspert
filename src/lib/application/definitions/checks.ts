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
import { QUALITIES } from '$lib/domain/music';
import { readsChanges } from '$lib/domain/sets';
import { allGrids } from '$lib/domain/grid/registry';

/** The sensors a session has (the keys of `SessionDeps.sensors` in `createApp`). */
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];

const GESTURE_RULES = ['link', 'climb', 'zone', 'jam'];
const STRING_NUMBERS = [1, 2, 3, 4, 5, 6];

/**
 * Why the params of an exercise of the changes (the ones `readGestureParams` reads at play) cannot
 * be run; null when they can. A set of strings is three distinct strings, 1 to 6, as the triads
 * on a string set are.
 */
function gestureParamsProblem(params: Record<string, unknown>): string | null {
	if (!GESTURE_RULES.includes(params.rule as string)) {
		return 'params.rule must be link, climb, zone or jam';
	}
	const { qualities, stringSets } = params;
	if (!Array.isArray(qualities)) return 'params.qualities must be a list of chord qualities';
	const quality = qualities.find((q) => !QUALITIES.some((known) => known.id === q));
	if (quality !== undefined) {
		return `params.qualities names ${JSON.stringify(quality)}, which is no chord quality`;
	}
	if (!Array.isArray(stringSets)) return 'params.stringSets must be a list of sets of strings';
	const bad = stringSets.findIndex(
		(set) =>
			!Array.isArray(set) ||
			set.length !== 3 ||
			!set.every((string) => STRING_NUMBERS.includes(string)) ||
			new Set(set).size !== 3
	);
	if (bad !== -1) return `params.stringSets[${bad}] is no set of strings`;
	return null;
}

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
			if (readsChanges(exercise)) {
				const bad = gestureParamsProblem(exercise.params);
				if (bad !== null) return bad;
			}
			// Any exercise that names grids: each must be defined by a file read so far.
			const grids = (exercise.params as { grids?: unknown } | undefined)?.grids;
			if (grids !== undefined) {
				if (!Array.isArray(grids) || !grids.every((id) => typeof id === 'string')) {
					return 'params.grids must be a list of grid ids';
				}
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
