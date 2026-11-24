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
import { setOfSkill } from '$lib/domain/sets';
import type { ItemSet } from '$lib/domain/sets/types';
import { correspondence } from '$lib/domain/sets/correspondences';
import { selectionFieldProblem } from '$lib/domain/exercise/selection/validate';
import { isSelectionTemplate } from '$lib/domain/exercise/selection/types';
import { passageDerivation } from '$lib/domain/families';

/** The sensors a session has (the keys of `SessionDeps.sensors` in `createApp`). */
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];

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
	const { enter, asks } = learning as Record<string, unknown>;
	if (Object.hasOwn(learning, 'draw')) {
		return 'params.learning.draw is gone: write params.learning.asks';
	}
	const own = skillById(exercise.practices);
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
		exercise(exercise, budget) {
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
				validateExercise(exercise, { sensors: SESSION_SENSORS, budget }) ??
				presentationProblem(exercise) ??
				screenProblem(exercise, { presenters, views }) ??
				previewProblem(exercise, { presenters, views }, budget);
			if (problem !== null) {
				// The validators name the exercise; a refusal carries its id apart.
				const prefix = `${exercise.id}: `;
				return problem.startsWith(prefix) ? problem.slice(prefix.length) : problem;
			}
			const opens = passagesOpensProblem(exercise);
			if (opens !== null) return opens;
			const learning = learningProblem(exercise);
			if (learning !== null) return learning;
			const listed = itemsListProblem(exercise);
			if (listed !== null) return listed;
			return null;
		}
	};
}
