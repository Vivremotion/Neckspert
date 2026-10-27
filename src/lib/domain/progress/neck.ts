import { IDENTIFY_NECK, LOCATE_NECK } from '$lib/domain/exercise/catalog';
import type { ExerciseId, MechanicId } from '$lib/domain/exercise/types';
import { neckCardKey, type NeckCard } from '$lib/domain/music';
import type { CardKey, PlannedItem } from '$lib/domain/types';

/**
 * The neck domain (learn selector, introduction queue, free plan, stats) knows both of its
 * mechanics; the core does not. This is where it reads their exercises.
 */
export function neckExerciseId(mechanic: MechanicId): ExerciseId {
	return asNeckMechanic(mechanic) === 'locate' ? LOCATE_NECK.id : IDENTIFY_NECK.id;
}

/** Whether a card or an attempt belongs to the neck, not to another track (triads). */
export function isNeck(x: { mechanic: MechanicId }): boolean {
	return x.mechanic === 'locate' || x.mechanic === 'identify';
}

/** Throws on a mechanic outside the neck domain. */
function asNeckMechanic(mechanic: MechanicId): NeckCard['mechanic'] {
	if (mechanic === 'locate' || mechanic === 'identify') return mechanic;
	throw new Error(`Not a neck mechanic: ${mechanic}`);
}

/** A neck card with its key, as `introduceCard` and `probeCard` take it. */
export function keyed(card: NeckCard): {
	key: CardKey;
	mechanic: NeckCard['mechanic'];
	item: NeckCard['item'];
} {
	return { key: neckCardKey(card), mechanic: card.mechanic, item: card.item };
}

/** A prompt of a neck card, in the exercise of its mechanic. */
export function plannedFor(
	card: NeckCard,
	fields: Omit<PlannedItem, 'exerciseId' | 'mechanic' | 'item'>
): PlannedItem {
	return {
		exerciseId: neckExerciseId(card.mechanic),
		mechanic: card.mechanic,
		item: card.item,
		...fields
	};
}
