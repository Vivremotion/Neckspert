import type { ExerciseDefinition } from '../exercise/types';

/** What an item's exercise sets for it (`params.learning`). */
export interface ItemLearning {
	/** Prompts before its next retest: after an aided or missed attempt, and after another one. */
	retestGaps: readonly [number, number];
	/** Successes since its last miss that take its fading aid away. */
	aidFadeSuccesses: number;
}

/** A category of items the procedure serves. */
export type LearningCategory = 'retest' | 'cold-review' | 'resumed' | 'new' | 'consolidation';

/** What the session sets for the whole set of items it serves, whatever their exercises. */
export interface SetLearning {
	/** Items being learned at once. */
	learningSlots: number;
	/** Distinct items served hot in a session. */
	maxWorkingSet: number;
	/** Learned items not yet acquired above which no new item enters. */
	maxUnconsolidated: number;
	/** Cold reviews in a session. */
	coldCap: number;
	/** A new item enters only when every item being learned has at least this success… */
	newItemMinCardSuccess: number;
	/** …over its last attempts of the session, this many. */
	newItemCardWindow: number;
	/** A new item enters only when the session's rolling success is at least this… */
	newItemMinSessionSuccess: number;
	/** …over its last prompts, this many (probes left out). */
	successWindow: number;
	/** Consolidation draws among this many weakest items… */
	consolidationPool: number;
	/** …skipping those served in the last this many prompts… */
	consolidationSkipRecent: number;
	/** …and favouring those confused in their last this many attempts. */
	confusionLookback: number;
	/** The order categories are served in. */
	order: readonly LearningCategory[];
	/** Misses in a row over the whole set (probes left out) after which a solid item comes next. */
	recoveryAfterMisses: number;
}

/** The settings of an item whose exercise writes none. To calibrate. */
export const DEFAULT_ITEM_LEARNING: ItemLearning = {
	retestGaps: [2, 4],
	aidFadeSuccesses: 1
};

/** The set's settings when the session writes none. To calibrate. */
export const DEFAULT_SET_LEARNING: SetLearning = {
	learningSlots: 3,
	maxWorkingSet: 6,
	maxUnconsolidated: 10,
	coldCap: 20,
	newItemMinCardSuccess: 0.8,
	newItemCardWindow: 5,
	newItemMinSessionSuccess: 0.7,
	successWindow: 10,
	consolidationPool: 3,
	consolidationSkipRecent: 2,
	confusionLookback: 3,
	order: ['retest', 'cold-review', 'resumed', 'new', 'consolidation'],
	recoveryAfterMisses: 1
};

/** `params.learning` of an exercise over the item defaults, field by field. */
export function itemLearningOf(definition: ExerciseDefinition): ItemLearning {
	const written = definition.params.learning as Partial<ItemLearning> | undefined;
	return { ...DEFAULT_ITEM_LEARNING, ...written };
}
