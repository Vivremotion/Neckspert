import { describe, expect, it } from 'vitest';
import * as scoring from '$lib/domain/scoring';
import type { Judgement } from '$lib/domain/scoring';

describe('scoring entry point', () => {
	it('exposes the constants of the README contract and the fatigue thresholds', () => {
		expect(scoring.PERFECT_WINDOW_MS).toBe(80);
		expect(scoring.LATE_LIMIT_MS).toBe(400);
		expect(scoring.FATIGUE_MIN_ANSWERS).toBe(12);
		expect(scoring.FATIGUE_WINDOW).toBe(6);
		expect(scoring.FATIGUE_ACCURACY_DROP).toBe(0.2);
		expect(scoring.FATIGUE_REACTION_INCREASE).toBe(0.25);
	});

	it('exposes every rule of the README contract', () => {
		const exported = scoring as Record<string, unknown>;
		for (const name of [
			'answerWindow',
			'isInWindow',
			'judgeLocate',
			'judgeIdentify',
			'isDirectRecall',
			'detectFatigue'
		]) {
			expect(typeof exported[name]).toBe('function');
		}
	});

	it('keeps internal helpers private', () => {
		expect('unanswered' in scoring).toBe(false);
		expect('secondsToMs' in scoring).toBe(false);
	});

	it('exports the Judgement type', () => {
		const judgement: Judgement = scoring.judgeIdentify({
			expected: 'F',
			promptTime: 0,
			answerTime: 0.5,
			answered: 'F'
		});
		expect(judgement.verdict).toBe('perfect');
	});
});
