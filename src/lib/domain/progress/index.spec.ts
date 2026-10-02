import { describe, expect, it } from 'vitest';
import * as progress from './index';

describe('progress index', () => {
	it('exports the README public API and nothing else essential from internals', () => {
		expect(progress.MIN_COLD_DELAY_MS).toBe(60 * 60 * 1000);
		expect(progress.LEARN_COLD_CAP).toBe(20);
		expect(progress.LEARNING_SLOTS).toBe(3);
		expect(progress.MASTERY_ACCURACY).toBe(0.9);
		expect(progress.MASTERY_SESSIONS).toBe(3);
		expect(progress.MASTERY_MIN_GAP_MS).toBe(72 * 60 * 60 * 1000);
		expect(progress.NEXT_SESSION_GAP_MS).toBe(2 * 60 * 60 * 1000);

		for (const name of [
			'classifyTemperature',
			'leadForThreshold',
			'introduceCard',
			'applyColdAttempt',
			'placementCard',
			'markLearned',
			'isAcquired',
			'isMastered',
			'cardStatus',
			'introductionOrder',
			'nextNewTarget',
			'buildDailyPlan',
			'buildPlacementPlan',
			'buildFreePlan',
			'nextSuggestedAt',
			'computeHomeStats',
			'summarizeSession',
			'buildNeckMap'
		] as const) {
			expect(typeof progress[name]).toBe('function');
		}

		expect(progress).not.toHaveProperty('isDirectRecall');
		expect(progress).not.toHaveProperty('adjustLeadBeats');
		expect(progress).not.toHaveProperty('introScheduling');
		expect(progress).not.toHaveProperty('TREND_WINDOW_MS');
		expect(progress).not.toHaveProperty('TREND_RATIO');
	});
});
