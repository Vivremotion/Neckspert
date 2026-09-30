import { describe, expect, it } from 'vitest';
import {
	DAILY_COLD_CAP,
	MASTERY_ACCURACY,
	MASTERY_MIN_GAP_MS,
	MASTERY_SESSIONS,
	MIN_COLD_DELAY_MS,
	NEW_PER_SESSION,
	NEXT_SESSION_GAP_MS,
	TREND_RATIO,
	TREND_WINDOW_MS,
	UNLOCK_RATIO
} from './constants';

describe('progress constants', () => {
	it('matches the README starting values', () => {
		expect(MIN_COLD_DELAY_MS).toBe(60 * 60 * 1000);
		expect(DAILY_COLD_CAP).toBe(20);
		expect(NEW_PER_SESSION).toBe(3);
		expect(UNLOCK_RATIO).toBe(0.8);
		expect(MASTERY_ACCURACY).toBe(0.9);
		expect(MASTERY_SESSIONS).toBe(3);
		expect(MASTERY_MIN_GAP_MS).toBe(72 * 60 * 60 * 1000);
		expect(NEXT_SESSION_GAP_MS).toBe(2 * 60 * 60 * 1000);
		expect(TREND_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
		expect(TREND_RATIO).toBe(0.05);
	});
});
