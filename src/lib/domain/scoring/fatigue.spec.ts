import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import {
	FATIGUE_ACCURACY_DROP,
	FATIGUE_MIN_ANSWERS,
	FATIGUE_REACTION_INCREASE,
	FATIGUE_WINDOW,
	detectFatigue
} from './fatigue';

function answered(correct: boolean, reactionMs = 1000): Attempt {
	return {
		sessionId: 's1',
		cardKey: 'locate:2:F',
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: null,
		promptedAt: 0,
		answer: { kind: 'note', midi: correct ? 65 : 66 },
		correct,
		verdict: correct ? 'perfect' : 'wrong',
		timingOffsetMs: 0,
		reactionMs,
		confusion: null
	};
}

function unanswered(): Attempt {
	return { ...answered(false), answer: null, timingOffsetMs: null, reactionMs: null };
}

function times(count: number, make: () => Attempt): Attempt[] {
	return Array.from({ length: count }, make);
}

const right = (reactionMs?: number) => answered(true, reactionMs);
const wrong = (reactionMs?: number) => answered(false, reactionMs);

describe('fatigue constants', () => {
	it('starts with 12 answers, slices of 6, a 20-point drop and a 25 % slowdown', () => {
		expect(FATIGUE_MIN_ANSWERS).toBe(12);
		expect(FATIGUE_WINDOW).toBe(6);
		expect(FATIGUE_ACCURACY_DROP).toBe(0.2);
		expect(FATIGUE_REACTION_INCREASE).toBe(0.25);
	});
});

describe('detectFatigue', () => {
	it('needs at least 12 answered attempts', () => {
		expect(detectFatigue([])).toBe(false);
		expect(detectFatigue([...times(6, () => right()), ...times(5, () => wrong())])).toBe(false);
		expect(detectFatigue([...times(6, () => right()), ...times(6, () => wrong())])).toBe(true);
	});

	it('does not count unanswered attempts towards the 12', () => {
		const attempts = [
			...times(6, () => right()),
			...times(5, () => wrong()),
			...times(5, unanswered)
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('flags two more errors in the last six (33 points)', () => {
		const attempts = [
			...times(6, () => right()),
			...times(4, () => right()),
			...times(2, () => wrong())
		];
		expect(detectFatigue(attempts)).toBe(true);
	});

	it('does not flag one more error in the last six (17 points)', () => {
		const attempts = [...times(6, () => right()), ...times(5, () => right()), wrong()];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('does not flag improving accuracy', () => {
		const attempts = [...times(6, () => wrong()), ...times(6, () => right())];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('flags a median reaction exactly 25 % slower', () => {
		const attempts = [...times(6, () => right(800)), ...times(6, () => right(1000))];
		expect(detectFatigue(attempts)).toBe(true);
	});

	it('does not flag a median reaction just under 25 % slower', () => {
		const attempts = [...times(6, () => right(800)), ...times(6, () => right(999))];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('does not flag getting faster', () => {
		const attempts = [...times(6, () => right(1200)), ...times(6, () => right(600))];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('compares medians, not means', () => {
		const attempts = [
			...times(6, () => right(1000)),
			...[900, 900, 900, 1300, 5000, 5000].map((ms) => right(ms))
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('ignores the attempts between the first six and the last six', () => {
		const attempts = [
			...times(6, () => right(800)),
			...times(8, () => wrong(5000)),
			...times(6, () => right(800))
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('skips unanswered attempts at the end of the session', () => {
		const attempts = [...times(12, () => right()), ...times(3, unanswered)];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('ignores mode 1 reaction times, which mostly measure the lead', () => {
		const locate = (reactionMs: number) => ({ ...right(reactionMs), leadBeats: 8 as const });
		const attempts = [...times(6, () => locate(800)), ...times(6, () => locate(6000))];
		expect(detectFatigue(attempts)).toBe(false);
	});
});
