import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from '../exercise/catalog';
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
import { DEFAULT_ITEM_LEARNING, DEFAULT_SET_LEARNING, itemLearningOf } from './params';

describe('the learning procedure’s settings', () => {
	it('default to today’s constants and today’s order', () => {
		expect(DEFAULT_ITEM_LEARNING).toEqual({
			retestGaps: LEARN_RETEST_GAPS,
			aidFadeSuccesses: STRING_AID_FADE_SUCCESSES
		});
		expect(DEFAULT_SET_LEARNING).toEqual({
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
		});
	});

	it('reads an item’s settings from its exercise, over the defaults field by field', () => {
		expect(itemLearningOf({ ...LOCATE_NECK, params: {} })).toEqual(DEFAULT_ITEM_LEARNING);
		expect(
			itemLearningOf({ ...LOCATE_NECK, params: { learning: { retestGaps: [1, 3] } } })
		).toEqual({ ...DEFAULT_ITEM_LEARNING, retestGaps: [1, 3] });
	});
});
