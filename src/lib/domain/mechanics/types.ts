import type { ExercisePacing, MechanicId } from '$lib/domain/exercise/types';
import type { TimingRelation } from '$lib/domain/timing';
import type { CardKey } from '$lib/domain/types';

/** What a mechanic is, apart from how it shows: its time relation, its items and its judge. */
export interface MechanicRules<I = unknown, O = unknown, A = unknown, C = unknown> {
	id: MechanicId;
	timing: TimingRelation;
	/** The time relation at the rhythm of an exercise; without it, `timing` serves every exercise. */
	timingFor?(pacing: ExercisePacing): TimingRelation;
	/** Learner model. Only 'memory' (FSRS) exists; 'skill' comes with the first gesture exercise. */
	learner: 'memory';
	itemKey(item: I): string;
	/** Throws on an invalid key (backup validation). */
	parseItem(itemKey: string): I;
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

export function cardKeyOf<I>(rules: MechanicRules<I>, item: I): CardKey {
	return `${rules.id}:${rules.itemKey(item)}`;
}
