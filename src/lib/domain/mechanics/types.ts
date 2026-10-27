import type { MechanicId } from '$lib/domain/exercise/types';
import type { TimingRelation } from '$lib/domain/timing';
import type { CardKey } from '$lib/domain/types';

/**
 * What every mechanic is: its id, its learner model and its items. The registry holds these; a
 * mechanic judged by a one-answer time relation adds the rest (`MechanicRules`).
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

/** What a mechanic is, apart from how it shows: its time relation, its items and its judge. */
export interface MechanicRules<
	I = unknown,
	O = unknown,
	A = unknown,
	C = unknown
> extends MechanicIdentity<I> {
	timing: TimingRelation;
	/**
	 * Rightness only; placing the answer in time belongs to the time relation. `sensor`: the
	 * sensor that read the observation, for a mechanic heard by several (the session always
	 * passes it; a mechanic heard by one sensor ignores it).
	 */
	judge(
		item: I,
		observation: O,
		sensor?: string
	): { correct: boolean; answer: A; confusion: C | null };
}

/** True for a mechanic judged by a one-answer time relation (the rhythm figure is not). */
export function isTimed(rules: MechanicIdentity): rules is MechanicRules {
	return 'timing' in rules;
}

/** The rules of a timed mechanic; throws when the mechanic has no time relation. */
export function timedRules(rules: MechanicIdentity): MechanicRules {
	if (!isTimed(rules)) throw new Error(`Mechanic ${rules.id} has no time relation`);
	return rules;
}

export function cardKeyOf<I>(rules: MechanicIdentity<I>, item: I): CardKey {
	return `${rules.id}:${rules.itemKey(item)}`;
}
