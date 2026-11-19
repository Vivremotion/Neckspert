import type { Attempt, CardKey, CardState, SkillId } from '../types';
import type { ExerciseId, Ladder } from '../exercise/types';
import type { ItemLearning } from './params';
import type { DirectRecall } from './recall';

export type { Ladder, LadderParams } from '../exercise/types';

/** A card as the procedure sees it: its skill and its item (the card key is `cardKey(skill, itemKey(item))`). */
export interface CardRef {
	skill: SkillId;
	item: unknown;
}

/** What an exercise gives the learning procedure, as data and pure functions. */
export interface LearningSubject {
	/** The cards this procedure serves, among those of the store (the others are only read, e.g. the anchor's for the zone). */
	owns(card: { skill: SkillId; key: CardKey }): boolean;
	itemKey(card: CardRef): string;
	exerciseOf(skill: SkillId): ExerciseId;
	/** The next item to introduce, ready (its prerequisites met), or null. `cards` and `history`: the whole store's, owned or not. `blocked`: may not be served now. */
	nextNew(
		cards: readonly CardState[],
		history: ReadonlyMap<CardKey, readonly Attempt[]>,
		blocked: (card: CardRef) => boolean
	): CardRef | null;
	/**
	 * true: the aided presentation follows its missed probe at once, even right after itself;
	 * false: it is due first but waits for a prompt after another card (a chord still ringing
	 * cannot be judged).
	 */
	presentsAtOnce: boolean;
	/** The ladder of a skill, as its exercise writes it. */
	ladder(skill: SkillId): Ladder;
	/** What the exercise of a skill sets for its items (`itemLearningOf`). */
	itemLearning(skill: SkillId): ItemLearning;
	/** The direct-recall rule of a skill. */
	recall(skill: SkillId): DirectRecall;
	/** A confusion recorded in the attempt (consolidation favours the confused). */
	confused(attempt: Attempt): boolean;
	/** A skill whose prompt may draw a fading aid (the string). */
	fadingAid(skill: SkillId): boolean;
	/** The item a prompt asks (a zone card draws its position here); absent: the card's item. */
	promptItem?(card: CardRef, random: () => number): unknown;
}
