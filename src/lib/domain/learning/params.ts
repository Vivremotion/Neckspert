import type { SelectionTemplate } from '../exercise/selection/types';
import type { ExerciseDefinition } from '../exercise/types';
import type { SkillId } from '../skill/types';

/** What an item's exercise sets for it (`params.learning`). */
export interface ItemLearning {
	/** Prompts before its next retest: after a miss, and after a success, whatever its level. */
	retestGaps: readonly [number, number];
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
	/** …over its last prompts, this many. */
	successWindow: number;
	/** Consolidation draws among this many weakest items… */
	consolidationPool: number;
	/** …skipping those served in the last this many prompts… */
	consolidationSkipRecent: number;
	/** …and favouring those confused in their last this many attempts. */
	confusionLookback: number;
	/** The order categories are served in. */
	order: readonly LearningCategory[];
	/** Misses in a row over the whole set after which a solid item comes next. */
	recoveryAfterMisses: number;
}

/** The settings of an item whose exercise writes none. To calibrate. */
export const DEFAULT_ITEM_LEARNING: ItemLearning = {
	retestGaps: [2, 4]
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

/** What lets an item of an exercise enter: an item of another skill is acquired (`params.learning.enter`). */
export interface EntryCondition {
	/** `skill`'s card for the item `item` names (a correspondence) must be acquired. */
	acquired: { skill: SkillId; item: string };
}

/** What an exercise writes of its learning (`params.learning`), over the defaults. */
export interface ExerciseLearning extends ItemLearning {
	enter?: EntryCondition;
	/**
	 * What a prompt asks of a card's item: a member drawn among those this selection admits for
	 * it, turned into an item by its set (`ItemSet.asked`), of the family its set asks. No `of`
	 * (the card's own item is the index), no order and no take: one is drawn.
	 */
	asks?: Pick<SelectionTemplate, 'family' | 'where'>;
}

/** `params.learning` of an exercise over the defaults; `enter` and `asks` only when written. */
export function exerciseLearningOf(definition: ExerciseDefinition): ExerciseLearning {
	// Trusts what the definition checks accepted (`learningProblem`).
	const written = (definition.params.learning ?? {}) as Partial<ExerciseLearning>;
	return { ...DEFAULT_ITEM_LEARNING, ...written };
}
