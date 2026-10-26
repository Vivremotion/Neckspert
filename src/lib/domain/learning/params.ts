import type { ExerciseDefinition } from '../exercise/types';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_POOL,
	CONSOLIDATION_SKIP_RECENT,
	LEARN_COLD_CAP,
	LEARN_RETEST_GAPS,
	LEARNING_SLOTS,
	MAX_UNCONSOLIDATED,
	MAX_WORKING_SET,
	NEW_NOTE_CARD_WINDOW,
	NEW_NOTE_MIN_CARD_SUCCESS,
	NEW_NOTE_MIN_SESSION_SUCCESS,
	RECOVERY_AFTER_MISSES,
	STRING_AID_FADE_SUCCESSES,
	SUCCESS_WINDOW
} from '../progress/constants';

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

/** Today's constants of `progress/constants.ts`: the settings of an item whose exercise writes none. */
export const DEFAULT_ITEM_LEARNING: ItemLearning = {
	retestGaps: LEARN_RETEST_GAPS,
	aidFadeSuccesses: STRING_AID_FADE_SUCCESSES
};

/** Today's constants of `progress/constants.ts`, and today's order: the set's settings when the session writes none. */
export const DEFAULT_SET_LEARNING: SetLearning = {
	learningSlots: LEARNING_SLOTS,
	maxWorkingSet: MAX_WORKING_SET,
	maxUnconsolidated: MAX_UNCONSOLIDATED,
	coldCap: LEARN_COLD_CAP,
	newItemMinCardSuccess: NEW_NOTE_MIN_CARD_SUCCESS,
	newItemCardWindow: NEW_NOTE_CARD_WINDOW,
	newItemMinSessionSuccess: NEW_NOTE_MIN_SESSION_SUCCESS,
	successWindow: SUCCESS_WINDOW,
	consolidationPool: CONSOLIDATION_POOL,
	consolidationSkipRecent: CONSOLIDATION_SKIP_RECENT,
	confusionLookback: CONFUSION_LOOKBACK,
	order: ['retest', 'cold-review', 'resumed', 'new', 'consolidation'],
	recoveryAfterMisses: RECOVERY_AFTER_MISSES
};

/** `params.learning` of an exercise over the item defaults, field by field. */
export function itemLearningOf(definition: ExerciseDefinition): ItemLearning {
	const written = definition.params.learning as Partial<ItemLearning> | undefined;
	return { ...DEFAULT_ITEM_LEARNING, ...written };
}
