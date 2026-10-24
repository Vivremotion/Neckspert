import type { Attempt, CardKey, CardState, LeadBeats } from '../types';
import type { ExerciseId, MechanicId } from '../exercise/types';
import type { Level } from '../time/levels';
import type { DirectRecall } from './recall';

/** What a level of an item changes: how long before the beat it is asked, and whether it is aided. */
export interface LadderParams {
	/** Beats of lead; null when the item has no lead (the answer is not played on a beat). */
	leadBeats: LeadBeats | null;
	aided: boolean;
}

/** An item's levels, level 0 first: the longest lead (aided), then shorter ones. */
export type Ladder = readonly Level<LadderParams>[];

/** A card as the procedure sees it: its mechanic and its item (the card key is `cardKey(mechanic, itemKey(item))`). */
export interface CardRef {
	mechanic: MechanicId;
	item: unknown;
}

/** What an exercise gives the learning procedure, as data and pure functions. */
export interface LearningSubject {
	/** The cards this procedure serves, among those of the store (the others are only read, e.g. the anchor's for the zone). */
	owns(card: { mechanic: MechanicId }): boolean;
	itemKey(card: CardRef): string;
	exerciseOf(mechanic: MechanicId): ExerciseId;
	/** The next item to introduce, ready (its prerequisites met), or null. `cards` and `history`: the whole store's, owned or not. `blocked`: may not be served now. */
	nextNew(
		cards: readonly CardState[],
		history: ReadonlyMap<CardKey, readonly Attempt[]>,
		blocked: (card: CardRef) => boolean
	): CardRef | null;
	/** Never served right after each other (the same item, its mirror, the same voicing). */
	neighbours(a: CardRef, b: CardRef): boolean;
	/** Preferred after `previous` when such a candidate exists (another string). Absent: none. */
	prefers?(candidate: CardRef, previous: CardRef): boolean;
	/** The ladder of a mechanic at the execution's tempo. */
	ladder(mechanic: MechanicId, tempoBpm: number): Ladder;
	/** The direct-recall rule of a mechanic. */
	recall(mechanic: MechanicId): DirectRecall;
	/** A confusion recorded in the attempt (consolidation favours the confused). */
	confused(attempt: Attempt): boolean;
	/** A mechanic whose prompt may draw a fading aid (the string). */
	fadingAid(mechanic: MechanicId): boolean;
	/** The item a prompt asks (a zone card draws its position here); absent: the card's item. */
	promptItem?(card: CardRef, random: () => number): unknown;
}
