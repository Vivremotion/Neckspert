import { describe, expect, it } from 'vitest';
import { LATE_LIMIT_MS, PERFECT_WINDOW_MS, answerWindow, isInWindow } from './timing';

describe('timing constants', () => {
	it('starts with an 80 ms perfect window and a 400 ms late limit', () => {
		expect(PERFECT_WINDOW_MS).toBe(80);
		expect(LATE_LIMIT_MS).toBe(400);
	});
});

describe('answerWindow', () => {
	it('opens with the prompt and closes LATE_LIMIT_MS after the target beat', () => {
		const window = answerWindow(12.345, 15.345);
		expect(window.opensAt).toBe(12.345);
		expect(window.closesAt).toBeCloseTo(15.745, 9);
	});
});

describe('isInWindow', () => {
	const window = answerWindow(12.345, 15.345);

	it('includes both edges', () => {
		expect(isInWindow(12.345, window)).toBe(true);
		expect(isInWindow(15.745, window)).toBe(true);
	});

	it('includes times between the edges', () => {
		expect(isInWindow(13, window)).toBe(true);
		expect(isInWindow(15.345, window)).toBe(true);
	});

	it('excludes times a millisecond outside', () => {
		expect(isInWindow(12.344, window)).toBe(false);
		expect(isInWindow(15.746, window)).toBe(false);
	});

	it('tolerates floating-point error on the edges', () => {
		const edge = answerWindow(1, 1.028);
		expect(1.453 - 25 / 1000).toBeGreaterThan(edge.closesAt);
		expect(isInWindow(1.453 - 25 / 1000, edge)).toBe(true);
		expect(isInWindow(12.345 - 1e-9, window)).toBe(true);
	});
});
