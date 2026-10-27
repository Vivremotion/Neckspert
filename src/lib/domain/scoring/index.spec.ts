import { describe, expect, it } from 'vitest';
import * as scoring from '$lib/domain/scoring';

describe('scoring entry point', () => {
	it('exposes the fatigue thresholds and the fatigue rule', () => {
		expect(scoring.FATIGUE_MIN_ANSWERS).toBe(12);
		expect(scoring.FATIGUE_WINDOW).toBe(6);
		expect(scoring.FATIGUE_ACCURACY_DROP).toBe(0.2);
		expect(scoring.FATIGUE_REACTION_INCREASE).toBe(0.25);
		expect(typeof scoring.detectFatigue).toBe('function');
	});

	it('leaves judging to the round plans and the mechanics', () => {
		for (const name of ['judgeLocate', 'judgeIdentify', 'isDirectRecall', 'answerWindow']) {
			expect(name in scoring).toBe(false);
		}
	});
});
