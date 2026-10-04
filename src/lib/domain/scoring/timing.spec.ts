import { describe, expect, it } from 'vitest';
import {
	LATE_CAPTURE_MS,
	LATE_LIMIT_MS,
	MIN_RESPONSE_MS,
	PERFECT_WINDOW_MS,
	answerWindow,
	isInWindow,
	judgeLocate,
	lateCaptureEnd
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

/** F on the B string: fret 6 (MIDI 65) and fret 18 (MIDI 77). */
const F_ON_B = [65, 77];

/** Prompt at 12.345 s, target beat 3 s later (4 beats at 80 bpm). */
function locate(
	onset: { time: number; midi: number } | null,
	latencyMs = 0,
	captureUntil?: number
) {
	return judgeLocate({
		acceptable: F_ON_B,
		promptTime: 12.345,
		targetTime: 15.345,
		onset,
		latencyMs,
		captureUntil
	});
}

describe('judgeLocate', () => {
	it('judges a missing onset as wrong, with no answer and no timing', () => {
		expect(locate(null)).toEqual({
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null
		});
	});

	it('judges the right note on the beat as perfect', () => {
		expect(locate({ time: 15.345, midi: 65 })).toEqual({
			answer: { kind: 'note', midi: 65 },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
	});

	it('accepts every acceptable octave', () => {
		expect(locate({ time: 15.345, midi: 77 }).verdict).toBe('perfect');
	});

	it('keeps exactly PERFECT_WINDOW_MS on either side perfect', () => {
		const late = locate({ time: 15.425, midi: 65 });
		expect(late.verdict).toBe('perfect');
		expect(late.timingOffsetMs).toBe(80);
		const early = locate({ time: 15.265, midi: 65 });
		expect(early.verdict).toBe('perfect');
		expect(early.timingOffsetMs).toBe(-80);
	});

	it('judges one millisecond beyond the perfect window as late or early', () => {
		expect(locate({ time: 15.426, midi: 65 })).toMatchObject({
			correct: true,
			verdict: 'late',
			timingOffsetMs: 81,
			reactionMs: 3081
		});
		expect(locate({ time: 15.264, midi: 65 })).toMatchObject({
			correct: true,
			verdict: 'early',
			timingOffsetMs: -81,
			reactionMs: 2919
		});
	});

	it('decides the verdict on the rounded offset', () => {
		expect(locate({ time: 15.4254, midi: 65 })).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 80
		});
		expect(locate({ time: 15.4256, midi: 65 })).toMatchObject({
			verdict: 'late',
			timingOffsetMs: 81
		});
	});

	it('judges a right note soon after the prompt as early', () => {
		expect(locate({ time: 12.7, midi: 65 })).toMatchObject({
			verdict: 'early',
			timingOffsetMs: -2645,
			reactionMs: 355
		});
	});

	it('leaves a note in the first MIN_RESPONSE_MS of the prompt unanswered', () => {
		expect(locate({ time: 12.5, midi: 65 })).toEqual(locate(null));
	});

	it('takes the last instant of the window as late', () => {
		expect(locate({ time: 15.745, midi: 65 })).toMatchObject({
			verdict: 'late',
			timingOffsetMs: LATE_LIMIT_MS,
			reactionMs: 3400
		});
	});

	it('treats an onset outside the window as no answer', () => {
		expect(locate({ time: 15.746, midi: 65 })).toEqual(locate(null));
		expect(locate({ time: 12.344, midi: 65 })).toEqual(locate(null));
	});

	it('judges a right note after the window, while still listening, as off beat', () => {
		expect(locate({ time: 16.5, midi: 65 }, 0, 18)).toEqual({
			answer: { kind: 'note', midi: 65 },
			correct: true,
			verdict: 'offbeat',
			timingOffsetMs: 1155,
			reactionMs: 4155
		});
	});

	it('keeps a wrong note after the window wrong, with its answer', () => {
		expect(locate({ time: 16.5, midi: 66 }, 0, 18)).toMatchObject({
			answer: { kind: 'note', midi: 66 },
			correct: false,
			verdict: 'wrong'
		});
	});

	it('leaves a note after the late capture unanswered', () => {
		expect(locate({ time: 18.001, midi: 65 }, 0, 18)).toEqual(locate(null));
	});

	it('judges a wrong pitch as wrong but keeps its answer and timing', () => {
		expect(locate({ time: 15.345, midi: 66 })).toEqual({
			answer: { kind: 'note', midi: 66 },
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
	});

	it('subtracts the latency before judging', () => {
		expect(locate({ time: 15.415, midi: 65 }, 70)).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
		expect(locate({ time: 15.325, midi: 65 }, -20)).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 0
		});
	});

	it('uses the corrected time to decide whether the onset is in the window', () => {
		expect(locate({ time: 15.8, midi: 65 }, 60)).toMatchObject({
			verdict: 'late',
			timingOffsetMs: 395
		});
		expect(locate({ time: 12.36, midi: 65 }, 20)).toEqual(locate(null));
	});

	it('accepts an onset that lands on the closing edge after latency correction', () => {
		const judgement = judgeLocate({
			acceptable: F_ON_B,
			promptTime: 0.028,
			targetTime: 1.028,
			onset: { time: 1.453, midi: 65 },
			latencyMs: 25
		});
		expect(judgement).toMatchObject({ verdict: 'late', timingOffsetMs: 400, reactionMs: 1400 });
	});
});
