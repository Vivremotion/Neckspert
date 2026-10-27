import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from '../exercise/catalog';
import * as constants from '../progress/constants';
import { DEFAULT_ITEM_LEARNING, DEFAULT_SET_LEARNING, itemLearningOf } from './params';

describe('the learning procedure’s settings', () => {
	it('keeps no constant of the procedure outside its defaults', () => {
		expect(DEFAULT_ITEM_LEARNING).toEqual({ retestGaps: [2, 4], aidFadeSuccesses: 1 });
		expect(DEFAULT_SET_LEARNING).toEqual({
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
		});
		// The module of the progress constants holds only what the progress domain itself reads.
		expect(Object.keys(constants).sort()).toEqual([
			'FREE_PLAY_COUNT',
			'MASTERY_ACCURACY',
			'MASTERY_MIN_GAP_MS',
			'MASTERY_SESSIONS',
			'MIN_COLD_DELAY_MS',
			'TREND_RATIO',
			'TREND_WINDOW_MS'
		]);
	});

	it('reads an item’s settings from its exercise, over the defaults field by field', () => {
		expect(itemLearningOf({ ...LOCATE_NECK, params: {} })).toEqual(DEFAULT_ITEM_LEARNING);
		expect(
			itemLearningOf({ ...LOCATE_NECK, params: { learning: { retestGaps: [1, 3] } } })
		).toEqual({ ...DEFAULT_ITEM_LEARNING, retestGaps: [1, 3] });
	});
});
