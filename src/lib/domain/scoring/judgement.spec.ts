import { describe, expect, it } from 'vitest';
import { secondsToMs, unanswered } from './judgement';

describe('unanswered', () => {
	it('is a wrong judgement with no answer and no timing', () => {
		expect(unanswered()).toEqual({
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null
		});
	});
});

describe('secondsToMs', () => {
	it('rounds to whole milliseconds', () => {
		expect(secondsToMs(0.75)).toBe(750);
		expect(secondsToMs(0.0504)).toBe(50);
		expect(secondsToMs(0.0506)).toBe(51);
	});

	it('absorbs floating-point error from audio-time subtraction', () => {
		expect(secondsToMs(15.395 - 15.345)).toBe(50);
		expect(secondsToMs(15.295 - 15.345)).toBe(-50);
	});

	it('rounds early and late offsets symmetrically', () => {
		expect(secondsToMs(-0.0504)).toBe(-50);
		expect(secondsToMs(-0.0506)).toBe(-51);
		expect(secondsToMs(-0.0005)).toBe(-1);
		expect(secondsToMs(0.0005)).toBe(1);
	});

	it('never returns negative zero', () => {
		expect(Object.is(secondsToMs(-0.0001), 0)).toBe(true);
	});
});
