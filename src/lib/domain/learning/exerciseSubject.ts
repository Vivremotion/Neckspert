import { itemEntryKey } from '../exercise/itemEntries';
import { ladderOf } from '../exercise/ladder';
import { resolvedParamsOf } from '../exercise/levels';
import { exerciseRecallOf } from '../exercise/recall';
import { compileSelection } from '../exercise/selection/compile';
import type { ExerciseDefinition, ExerciseId, Ladder } from '../exercise/types';
import { isAcquired } from '../progress/cards';
import { correspondence, type Correspondence } from '../sets/correspondences';
import { admitted, familyNamed, type Family } from '../families';
import { setOfSkill, type ItemSet } from '../sets';
import { hasCards, skillById } from '../skill/registry';
import { cardKey, type Attempt, type CardKey, type CardState, type SkillId } from '../types';
import {
	exerciseLearningOf,
	itemLearningOf,
	type ExerciseLearning,
	type ItemLearning
} from './params';
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
	/** What a prompt asks of a card's item, when the exercise writes it (`params.learning.asks`). */
	asks: Asks | null;
}

/** A member drawn among those a selection admits, turned into the item asked by the set. */
interface Asks {
	template: NonNullable<ExerciseLearning['asks']>;
	family: Family;
	asked: NonNullable<ItemSet['asked']>;
	memberOf: (item: unknown) => string | null;
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
	let asks: Asks | null = null;
	if (learning.asks) {
		const family = familyNamed(learning.asks.family);
		if (!family || !set.asked || family.id !== set.asks) {
			throw new Error(`"${definition.id}" asks a member its set or family cannot give`);
		}
		const asked = set.asked.bind(set);
		const memberOf = (item: unknown) => set.memberOf?.(item) ?? null;
		asks = { template: learning.asks, family, asked, memberOf };
	}
	return {
		definition,
		set,
		items,
		owned: new Set(items.map(({ key }) => key)),
		ladder: ladderOf(definition),
		itemLearning: itemLearningOf(definition),
		entry,
		asks
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
	/** Stored attempts: the item last asked of each card, for a member asked. */
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
	 * The item last asked of each card that asks a member: that of its latest attempt holding
	 * one, then the last asked in the session.
	 */
	const lastAsked = new Map<CardKey, unknown>();
	const asking = [...input.attempts]
		.filter((attempt) => bySkill.get(attempt.skill)?.asks && askedItem(attempt) !== undefined)
		.sort((a, b) => a.promptedAt - b.promptedAt);
	for (const attempt of asking) lastAsked.set(attempt.cardKey, askedItem(attempt));

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
		promptItem(card, random, level) {
			const exercise = of(card.skill);
			const asks = exercise.asks;
			if (!asks) return card.item;
			const key = cardKey(card.skill, exercise.set.itemKey(card.item));
			const params = resolvedParamsOf(exercise.definition, {
				exerciseLevel: 0,
				itemLevel: level
			});
			const { index, selection } = compileSelection(
				exercise.definition,
				{ item: card.item },
				asks.template,
				params
			);
			const last = lastAsked.get(key);
			const id = last === undefined ? null : asks.memberOf(last);
			const previous = id === null ? null : asks.family.member(id);
			const members = admitted(asks.family, index, selection, { previous });
			// Nothing admitted, nothing to draw: the card's own item, no number taken.
			if (members.length === 0) return card.item;
			const member = members[Math.min(members.length - 1, Math.floor(random() * members.length))];
			const asked = asks.asked(card.item, member, random);
			lastAsked.set(key, asked);
			return asked;
		}
	};
}
