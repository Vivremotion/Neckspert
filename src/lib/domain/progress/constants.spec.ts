import { describe, expect, it } from 'vitest';
import {
	FREE_PLAY_COUNT,
	MASTERY_ACCURACY,
	MASTERY_MIN_GAP_MS,
	MASTERY_SESSIONS,
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

	it('matches the free play starting value', () => {
		expect(FREE_PLAY_COUNT).toBe(20);
	});
});
