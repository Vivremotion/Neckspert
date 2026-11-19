import { findPresenter, SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import type { SetPresenter } from '$lib/application/sets';
import {
	presentationProblem,
	previewProblem,
	screenProblem
} from '$lib/application/presentation/validate';
import type { DefinitionChecks } from '$lib/domain/definitions';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise';
import { hasCards, hasSkill, skillById } from '$lib/domain/skill/registry';
import { isTriadQuality, QUALITIES } from '$lib/domain/music';
import { readsChanges } from '$lib/domain/sets';
import { correspondence } from '$lib/domain/sets/correspondences';
import { drawNamed } from '$lib/domain/sets/draws';
import { allGrids } from '$lib/domain/grid/registry';

/** The sensors a session has (the keys of `SessionDeps.sensors` in `createApp`). */
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];

const GESTURE_RULES = ['link', 'climb', 'zone', 'jam'];
const STRING_NUMBERS = [1, 2, 3, 4, 5, 6];

/**
 * Why the params of an exercise of the changes (the ones `readGestureParams` reads at play) cannot
 * be run; null when they can. A set of strings is three strings, 1 to 6, from the lowest to the
 * highest (strictly decreasing numbers), as a close triad voicing needs; a quality is a triad's.
 */
function gestureParamsProblem(params: Record<string, unknown>): string | null {
	if (!GESTURE_RULES.includes(params.rule as string)) {
		return 'params.rule must be link, climb, zone or jam';
	}
	const { qualities, stringSets } = params;
	if (!Array.isArray(qualities)) return 'params.qualities must be a list of chord qualities';
	for (const id of qualities) {
		const known = QUALITIES.find((quality) => quality.id === id);
		if (known === undefined) {
			return `params.qualities names ${JSON.stringify(id)}, which is no chord quality`;
		}
		if (!isTriadQuality(known)) {
			return `params.qualities names ${JSON.stringify(id)}, which is no triad quality`;
		}
	}
	if (!Array.isArray(stringSets)) return 'params.stringSets must be a list of sets of strings';
	const bad = stringSets.findIndex(
		(set) =>
			!Array.isArray(set) ||
			set.length !== 3 ||
			!set.every((string) => STRING_NUMBERS.includes(string)) ||
			!set.every((string, i) => i === 0 || string < set[i - 1])
	);
	if (bad !== -1) return `params.stringSets[${bad}] is no set of strings`;
	return null;
}

/**
 * Why what an exercise writes of its learning (`params.learning`: entry condition, draw) cannot be
 * run; null when it can. A key no piece reads passes, like any parameter.
 */
function learningProblem(exercise: ExerciseDefinition): string | null {
	const learning = exercise.params?.learning;
	if (learning === undefined) return null;
	if (typeof learning !== 'object' || learning === null || Array.isArray(learning)) {
		return 'params.learning must be an object';
	}
	const { presentAtOnce, enter, draw } = learning as Record<string, unknown>;
	const own = skillById(exercise.practices);
	if (presentAtOnce !== undefined && typeof presentAtOnce !== 'boolean') {
		return 'params.learning.presentAtOnce must be true or false';
	}
	if (enter !== undefined) {
		const acquired = (enter as { acquired?: { skill?: unknown; item?: unknown } } | null)?.acquired;
		if (
			typeof enter !== 'object' ||
			enter === null ||
			typeof acquired !== 'object' ||
			acquired === null ||
			typeof acquired.skill !== 'string' ||
			typeof acquired.item !== 'string'
		) {
			return 'params.learning.enter must be { acquired: { skill, item } }';
		}
		if (!own.memory) return 'params.learning.enter needs a skill with cards';
		if (!hasSkill(acquired.skill)) {
			return `params.learning.enter names skill "${acquired.skill}", which no file read so far defines`;
		}
		if (!hasCards(acquired.skill)) {
			return `params.learning.enter names skill "${acquired.skill}", which has no cards`;
		}
		const from = own.items;
		const to = skillById(acquired.skill).items;
		if (correspondence(acquired.item, from, to) === null) {
			return `params.learning.enter.acquired.item "${acquired.item}" is no correspondence from ${from} to ${to}`;
		}
	}
	if (draw !== undefined) {
		if (typeof draw !== 'string') return 'params.learning.draw must be a string';
		if (drawNamed(draw, own.items) === null) {
			return `params.learning.draw "${draw}" is no draw of ${own.items}`;
		}
	}
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
			const learning = learningProblem(exercise);
			if (learning !== null) return learning;
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
