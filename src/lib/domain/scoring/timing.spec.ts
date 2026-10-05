import { describe, expect, it } from 'vitest';
import {
	LATE_CAPTURE_MS,
	LATE_LIMIT_MS,
	MIN_RESPONSE_MS,
	PERFECT_WINDOW_MS,
	answerWindow,
	isInWindow,
	lateCaptureEnd,
	secondsToMs
} from './timing';

describe('timing constants', () => {
	it('starts with an 80 ms perfect window and a 400 ms late limit', () => {
		expect(PERFECT_WINDOW_MS).toBe(80);
		expect(LATE_LIMIT_MS).toBe(400);
	});

	it('listens 2 s more for an off-beat answer, and ignores the first 300 ms of a prompt', () => {
		expect(LATE_CAPTURE_MS).toBe(2000);
		expect(MIN_RESPONSE_MS).toBe(300);
	});
});

describe('answerWindow', () => {
	it('opens MIN_RESPONSE_MS after the prompt and closes LATE_LIMIT_MS after the target beat', () => {
		const window = answerWindow(12.345, 15.345);
		expect(window.opensAt).toBeCloseTo(12.645, 9);
		expect(window.closesAt).toBeCloseTo(15.745, 9);
	});
});

describe('lateCaptureEnd', () => {
	it('listens LATE_CAPTURE_MS past the window at 80 bpm, before the breathing bar ends', () => {
		// Target at 10 s; next prompt no earlier than 4 beats later (3 s at 80 bpm).
		expect(lateCaptureEnd(10, 13)).toBeCloseTo(12.4, 9);
	});

	it('stops at the next prompt when the tempo leaves less room (160 bpm)', () => {
		expect(lateCaptureEnd(10, 11.5)).toBe(11.5);
	});
});

describe('isInWindow', () => {
	const window = answerWindow(12.345, 15.345);

	it('includes both edges', () => {
		expect(isInWindow(12.645, window)).toBe(true);
		expect(isInWindow(15.745, window)).toBe(true);
	});

	it('includes times between the edges', () => {
		expect(isInWindow(13, window)).toBe(true);
		expect(isInWindow(15.345, window)).toBe(true);
	});

	it('excludes times a millisecond outside', () => {
		expect(isInWindow(12.644, window)).toBe(false);
		expect(isInWindow(15.746, window)).toBe(false);
	});

	it('tolerates floating-point error on the edges', () => {
		const edge = answerWindow(1, 1.028);
		expect(1.453 - 25 / 1000).toBeGreaterThan(edge.closesAt);
		expect(isInWindow(1.453 - 25 / 1000, edge)).toBe(true);
		expect(isInWindow(12.645 - 1e-9, window)).toBe(true);
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
