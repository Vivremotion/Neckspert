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
import { readsChanges, setOfSkill } from '$lib/domain/sets';
import type { ItemSet } from '$lib/domain/sets/types';
import { correspondence } from '$lib/domain/sets/correspondences';
import { selectionFieldProblem } from '$lib/domain/exercise/selection/validate';
import { isSelectionTemplate } from '$lib/domain/exercise/selection/types';
import { passageDerivation } from '$lib/domain/families';
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
 * Why what an exercise writes of its learning (`params.learning`: entry condition, member asked)
 * cannot be run; null when it can. A key no piece reads passes, like any parameter.
 */
function learningProblem(exercise: ExerciseDefinition): string | null {
	const learning = exercise.params?.learning;
	if (learning === undefined) return null;
	if (typeof learning !== 'object' || learning === null || Array.isArray(learning)) {
		return 'params.learning must be an object';
	}
	const { presentAtOnce, enter, asks } = learning as Record<string, unknown>;
	if (Object.hasOwn(learning, 'draw')) {
		return 'params.learning.draw is gone: write params.learning.asks';
	}
	const own = skillById(exercise.practices);
	if (presentAtOnce !== undefined && typeof presentAtOnce !== 'boolean') {
		return 'params.learning.presentAtOnce must be true or false';
	}
	if (enter !== undefined) {
		const acquired =
			typeof enter === 'object' && enter !== null
				? (enter as { acquired?: { skill?: unknown; item?: unknown } }).acquired
				: undefined;
		if (
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
	return asks === undefined ? null : asksProblem(exercise, asks);
}

/** Why a member cannot be asked as `params.learning.asks` writes it; null when it can. */
function asksProblem(exercise: ExerciseDefinition, asks: unknown): string | null {
	const field = 'params.learning.asks';
	if (typeof asks !== 'object' || asks === null || Array.isArray(asks)) {
		return `${field} must be a selection`;
	}
	if (Object.hasOwn(asks, 'order') || Object.hasOwn(asks, 'take')) {
		return `${field} takes no order and no take: one member is drawn`;
	}
	if (Object.hasOwn(asks, 'of')) {
		return `${field} takes no "of": a member of the card’s own item is asked`;
	}
	const set = setOfSkill(exercise.practices);
	if (!set.asked || set.asks === undefined) {
		return `${field} needs a set that can ask a member, which ${set.id} cannot`;
	}
	const family = (asks as { family?: unknown }).family;
	if (family !== set.asks) {
		return `${field} names family ${JSON.stringify(family)}, but ${set.id} asks members of ${set.asks}`;
	}
	const problem = selectionFieldProblem(exercise, asks);
	if (problem === null) return null;
	return `${problem.field === '' ? field : `${field}.${problem.field}`} ${problem.text}`;
}

/**
 * Why the opening of a passage's index cannot be read (`passages.opens`, its form checked by
 * `validateExercise`): a skill no file defines or without cards, a round with no member content
 * whose shapes it groups, a content whose members are items of no set, contents whose members are
 * items of different sets, a correspondence from that set to the skill's that does not exist.
 * Null when it can, or when the exercise writes none.
 */
export function passagesOpensProblem(exercise: ExerciseDefinition): string | null {
	const acquired = exercise.passages?.opens?.acquired;
	if (acquired === undefined) return null;
	if (!hasSkill(acquired.skill)) {
		return `passages.opens names skill "${acquired.skill}", which no file read so far defines`;
	}
	if (!hasCards(acquired.skill)) {
		return `passages.opens names skill "${acquired.skill}", which has no cards`;
	}
	const contents = (exercise.round?.expectations ?? [])
		.map((expectation) => (expectation as { content?: unknown }).content)
		.filter(isSelectionTemplate);
	if (contents.length === 0) return 'passages.opens needs a round whose content is a selection';
	const sets = new Set<string>();
	for (const { family } of contents) {
		const derivation = passageDerivation(family);
		if (derivation === null) {
			return `passages.opens reads the members of family "${family}", which are items of no set`;
		}
		sets.add(derivation.set);
	}
	if (sets.size > 1) return 'passages.opens needs the round’s contents to give members of one set';
	const [from] = sets;
	const to = skillById(acquired.skill).items;
	if (correspondence(acquired.item, from, to) === null) {
		return `passages.opens.acquired.item "${acquired.item}" is no correspondence from ${from} to ${to}`;
	}
	return null;
}

/** The key a set writes for a key as written; the key as written when the set cannot read it. */
function itemKeyOf(set: ItemSet, written: string): string {
	try {
		return set.itemKey(set.parseItem(written));
	} catch {
		return written;
	}
}

/**
 * Why the items an exercise lists cannot be introduced; null when they can. A skill with cards is
 * learned item by item, so its exercise lists them, each once; an exercise without memory may
 * list none, or repeat one (a sequence of shapes).
 */
function itemsListProblem(exercise: ExerciseDefinition): string | null {
	if (!hasCards(exercise.practices)) return null;
	const { items } = exercise;
	if (!Array.isArray(items)) {
		return 'an exercise that practises a skill with cards must list its items';
	}
	const set = setOfSkill(exercise.practices);
	const first = new Map<string, number>();
	for (const [i, entry] of items.entries()) {
		const written = typeof entry === 'string' ? entry : (entry as { item?: unknown })?.item;
		if (typeof written !== 'string') continue;
		// Two spellings of one item are one item: compare the keys the set writes.
		const key = itemKeyOf(set, written);
		const seen = first.get(key);
		if (seen !== undefined) return `items[${i}] repeats items[${seen}]`;
		first.set(key, i);
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
			const opens = passagesOpensProblem(exercise);
			if (opens !== null) return opens;
			const learning = learningProblem(exercise);
			if (learning !== null) return learning;
			const listed = itemsListProblem(exercise);
			if (listed !== null) return listed;
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
