import { itemEntryKey } from '../exercise/itemEntries';
import { ladderOf } from '../exercise/ladder';
import { exerciseRecallOf } from '../exercise/recall';
import type { ExerciseDefinition, ExerciseId, Ladder } from '../exercise/types';
import { isAcquired } from '../progress/cards';
import { correspondence, type Correspondence } from '../sets/correspondences';
import { drawNamed, type Draw } from '../sets/draws';
import { setOfSkill, type ItemSet } from '../sets';
import { hasCards, skillById } from '../skill/registry';
import { cardKey, type Attempt, type CardKey, type CardState, type SkillId } from '../types';
import { exerciseLearningOf, itemLearningOf, type ItemLearning } from './params';
import { directRecallOf, type DirectRecall } from './recall';
import type { CardRef, LearningSubject } from './subject';

/** What lets an exercise's item enter: the card a correspondence names, acquired. */
export interface Entry {
	skill: SkillId;
	set: ItemSet;
	correspondence: Correspondence;
	recall: DirectRecall;
}

/** What the subject reads once of an exercise. */
interface Practised {
	definition: ExerciseDefinition;
	set: ItemSet;
	/** Its listed items, in order, with their card keys. */
	items: readonly { key: CardKey; item: unknown }[];
	owned: ReadonlySet<CardKey>;
	ladder: Ladder;
	itemLearning: ItemLearning;
	entry: Entry | null;
	draw: Draw | null;
}

/** A skill that writes no direct recall: only a card marked acquired counts. */
const NO_RECALL: DirectRecall = () => false;

function practised(definition: ExerciseDefinition): Practised {
	const skill = definition.practices;
	const set = setOfSkill(skill);
	const learning = exerciseLearningOf(definition);
	// Keyed as the set writes the item, whatever spelling the list reads.
	const items = (definition.items ?? []).map((entry) => {
		const item = set.parseItem(itemEntryKey(entry));
		return { key: cardKey(skill, set.itemKey(item)), item };
	});
	let entry: Entry | null = null;
	if (learning.enter) {
		const named = learning.enter.acquired;
		const namedSet = setOfSkill(named.skill);
		const found = correspondence(named.item, set.id, namedSet.id);
		if (found === null) {
			throw new Error(`"${definition.id}" enters by no correspondence "${named.item}"`);
		}
		entry = {
			skill: named.skill,
			set: namedSet,
			correspondence: found,
			recall: directRecallOf(skillById(named.skill)) ?? NO_RECALL
		};
	}
	const draw = learning.draw === undefined ? null : drawNamed(learning.draw, set.id);
	if (learning.draw !== undefined && draw === null) {
		throw new Error(`"${definition.id}" draws by no draw "${learning.draw}"`);
	}
	return {
		definition,
		set,
		items,
		owned: new Set(items.map(({ key }) => key)),
		ladder: ladderOf(definition),
		itemLearning: itemLearningOf(definition),
		entry,
		draw
	};
}

/** The entry condition holds: the card it names exists and is acquired. */
function enters(
	entry: Entry,
	item: unknown,
	cards: ReadonlyMap<CardKey, CardState>,
	history: ReadonlyMap<CardKey, readonly Attempt[]>
): boolean {
	const named = entry.correspondence.of(item);
	if (named === null) return false;
	const key = cardKey(entry.skill, entry.set.itemKey(named));
	const card = cards.get(key);
	return card !== undefined && isAcquired(card, history.get(key) ?? [], entry.recall);
}

/** The item an attempt asked (`data.item`); undefined when its data holds none. */
function askedItem(attempt: Attempt): unknown {
	return (attempt.data as { item?: unknown } | null)?.item ?? undefined;
}

/**
 * The first of `items` (of `skill`, in order, with their card keys) that has no card in `cards`,
 * is not blocked, and whose entry condition, when there is one, holds; null when none.
 */
export function firstReady(
	skill: SkillId,
	items: readonly { key: CardKey; item: unknown }[],
	entry: Entry | null,
	cards: ReadonlyMap<CardKey, CardState>,
	history: ReadonlyMap<CardKey, readonly Attempt[]>,
	blocked: (card: CardRef) => boolean
): CardRef | null {
	for (const { key, item } of items) {
		if (cards.has(key)) continue;
		const ref: CardRef = { skill, item };
		if (blocked(ref)) continue;
		if (entry && !enters(entry, item, cards, history)) continue;
		return ref;
	}
	return null;
}

/**
 * The learning subject of a session's memory exercises, read from their data. `exercises` in the
 * order they introduce: the first with a ready item does. Throws when two practise one skill.
 */
export function exerciseSubject(input: {
	exercises: readonly ExerciseDefinition[];
	/** Stored attempts: the item last asked of each card, for a draw. */
	attempts: readonly Attempt[];
}): LearningSubject {
	const bySkill = new Map<SkillId, Practised>();
	for (const definition of input.exercises) {
		const skill = definition.practices;
		if (bySkill.has(skill)) throw new Error(`two exercises practise skill "${skill}"`);
		if (!hasCards(skill)) throw new Error(`"${definition.id}" practises a skill without cards`);
		bySkill.set(skill, practised(definition));
	}
	const ordered = [...bySkill.values()];

	function of(skill: SkillId): Practised {
		const found = bySkill.get(skill);
		if (!found) throw new Error(`No exercise of this subject practises skill "${skill}"`);
		return found;
	}

	/**
	 * The item last asked of each card that draws: that of its latest attempt holding one, then
	 * the last drawn.
	 */
	const lastAsked = new Map<CardKey, unknown>();
	const drawing = [...input.attempts]
		.filter((attempt) => bySkill.get(attempt.skill)?.draw && askedItem(attempt) !== undefined)
		.sort((a, b) => a.promptedAt - b.promptedAt);
	for (const attempt of drawing) lastAsked.set(attempt.cardKey, askedItem(attempt));

	const recalls = new Map<SkillId, DirectRecall>();

	return {
		owns: (card) => bySkill.get(card.skill)?.owned.has(card.key) ?? false,
		itemKey: (card) => of(card.skill).set.itemKey(card.item),
		exerciseOf: (skill): ExerciseId => of(skill).definition.id,
		nextNew(cards, history, blocked) {
			const byKey = new Map(cards.map((card) => [card.key, card]));
			for (const exercise of ordered) {
				const skill = exercise.definition.practices;
				const ready = firstReady(skill, exercise.items, exercise.entry, byKey, history, blocked);
				if (ready) return ready;
			}
			return null;
		},
		presentsAtOnce: ordered.every(
			(exercise) => exerciseLearningOf(exercise.definition).presentAtOnce
		),
		ladder: (skill) => of(skill).ladder,
		itemLearning: (skill) => of(skill).itemLearning,
		recall(skill) {
			let recall = recalls.get(skill);
			if (!recall) {
				recall = exerciseRecallOf(of(skill).definition);
				recalls.set(skill, recall);
			}
			return recall;
		},
		confused: (attempt) => (attempt.data as { confusion?: unknown } | null)?.confusion != null,
		fadingAid: (skill) => of(skill).definition.presentation?.fading !== undefined,
		promptItem(card, random) {
			const exercise = of(card.skill);
			if (!exercise.draw) return card.item;
			const key = cardKey(card.skill, exercise.set.itemKey(card.item));
			const asked = exercise.draw(card.item, lastAsked.get(key) ?? null, random);
			lastAsked.set(key, asked);
			return asked;
		}
	};
}
