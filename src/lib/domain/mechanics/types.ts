import type { MechanicId } from '$lib/domain/exercise/types';
import type { CardKey } from '$lib/domain/types';

/**
 * What every mechanic is: its id, its learner model and its items. The registry holds these; a
 * mechanic whose answer is judged for content adds its judge (`MechanicRules`).
 */
export interface MechanicIdentity<I = unknown> {
	id: MechanicId;
	/**
	 * Learner model. 'memory': FSRS cards. 'skill': a know-how measured by its attempts (their
	 * observations kept), which never creates nor touches a card.
	 */
	learner: 'memory' | 'skill';
	itemKey(item: I): string;
	/** Throws on an invalid key (backup validation). */
	parseItem(itemKey: string): I;
	/**
	 * The part of a prompted item its card keeps, when a prompt adds to it (a position drawn for
	 * this prompt only); the item itself without it. `parseItem` returns this part.
	 */
	cardItem?(item: I): unknown;
}

/** What a mechanic is, apart from how it shows: its items and its judge of content. */
export interface MechanicRules<
	I = unknown,
	O = unknown,
	A = unknown,
	C = unknown
> extends MechanicIdentity<I> {
	/**
	 * Rightness only; placing the answer in time belongs to the round's plan. `sensor`: the
	 * sensor that read the observation, for a mechanic heard by several (the session always
	 * passes it; a mechanic heard by one sensor ignores it).
	 */
	judge(
		item: I,
		observation: O,
		sensor?: string
	): { correct: boolean; answer: A; confusion: C | null };
}

/** The length in beats a key ends with (`...@4`), positive and written plainly. Throws naming the key. */
export function parseItemBeats(part: string, itemKey: string): number {
	const beats = Number(part);
	if (!Number.isFinite(beats) || beats <= 0 || String(beats) !== part) {
		throw new Error(`Invalid length in beats in item key: "${itemKey}"`);
	}
	return beats;
}

export function cardKeyOf<I>(rules: MechanicIdentity<I>, item: I): CardKey {
	return `${rules.id}:${rules.itemKey(item)}`;
}
