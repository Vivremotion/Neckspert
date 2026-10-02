import { describe, expect, it } from 'vitest';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_SKIP_RECENT,
	FREE_PLAY_COUNT,
	LEARN_COLD_CAP,
	LEARN_PRESENT_LEAD_BEATS,
	LEARN_RETEST_GAPS,
	LEARN_SESSION_MS,
	LEARN_SUCCESSES,
	LEARNING_SLOTS,
	MASTERY_ACCURACY,
	MASTERY_MIN_GAP_MS,
	MASTERY_SESSIONS,
	MAX_UNCONSOLIDATED,
	MIN_COLD_DELAY_MS,
	TREND_RATIO,
	TREND_WINDOW_MS
} from './constants';

describe('progress constants', () => {
	it('matches the starting values', () => {
		expect(MIN_COLD_DELAY_MS).toBe(60 * 60 * 1000);
		expect(MASTERY_ACCURACY).toBe(0.9);
		expect(MASTERY_SESSIONS).toBe(3);
		expect(MASTERY_MIN_GAP_MS).toBe(72 * 60 * 60 * 1000);
		expect(TREND_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
		expect(TREND_RATIO).toBe(0.05);
	});

	it('matches the learn session starting values', () => {
		expect(LEARN_SESSION_MS).toBe(5 * 60 * 1000);
		expect(LEARN_COLD_CAP).toBe(20);
		expect(LEARNING_SLOTS).toBe(3);
		expect(MAX_UNCONSOLIDATED).toBe(10);
		expect(LEARN_PRESENT_LEAD_BEATS).toBe(8);
		expect(LEARN_RETEST_GAPS).toEqual([2, 4]);
		expect(LEARN_SUCCESSES).toBe(2);
		expect(CONSOLIDATION_SKIP_RECENT).toBe(2);
		expect(CONFUSION_LOOKBACK).toBe(3);
		expect(FREE_PLAY_COUNT).toBe(20);
	});
});
