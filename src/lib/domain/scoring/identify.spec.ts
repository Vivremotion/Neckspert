import { describe, expect, it } from 'vitest';
import type { PitchName } from '$lib/domain/music/types';
import { IDENTIFY_RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { judgeIdentify } from './identify';

/** "corde de A, case 8" is F; the prompt appears at 12.345 s. */
function identify(answerTime: number | null, answered: PitchName | null) {
	return judgeIdentify({ expected: 'F', promptTime: 12.345, answerTime, answered });
}

const NO_ANSWER = {
	answer: null,
	correct: false,
	verdict: 'wrong',
	timingOffsetMs: null,
	reactionMs: null
};

describe('judgeIdentify', () => {
	it('judges no answer as wrong, with no timing', () => {
		expect(identify(null, null)).toEqual(NO_ANSWER);
	});

	it('treats a half-filled answer as no answer', () => {
		expect(identify(13, null)).toEqual(NO_ANSWER);
		expect(identify(null, 'F')).toEqual(NO_ANSWER);
	});

	it('judges the right name within the threshold as perfect', () => {
		expect(identify(12.985, 'F')).toEqual({
			answer: { kind: 'name', pitch: 'F' },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: null,
			reactionMs: 640
		});
	});

	it('keeps exactly IDENTIFY_RECALL_THRESHOLD_MS perfect and one millisecond more late', () => {
		expect(identify(15.345, 'F')).toMatchObject({
			verdict: 'perfect',
			reactionMs: IDENTIFY_RECALL_THRESHOLD_MS
		});
		expect(identify(15.346, 'F')).toMatchObject({
			correct: true,
			verdict: 'late',
			reactionMs: IDENTIFY_RECALL_THRESHOLD_MS + 1
		});
	});

	it('decides the verdict on the rounded reaction time', () => {
		expect(identify(15.3454, 'F')).toMatchObject({ verdict: 'perfect', reactionMs: 3000 });
		expect(identify(15.3456, 'F')).toMatchObject({ verdict: 'late', reactionMs: 3001 });
	});

	it('judges a wrong name as wrong, however fast, and keeps it', () => {
		expect(identify(12.645, 'F#')).toEqual({
			answer: { kind: 'name', pitch: 'F#' },
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: 300
		});
	});

	it('treats a tap before the prompt as no answer', () => {
		expect(identify(12.3, 'F')).toEqual(NO_ANSWER);
		expect(identify(12.345, 'F')).toMatchObject({ verdict: 'perfect', reactionMs: 0 });
	});

	it('never judges early', () => {
		for (let ms = 0; ms <= 5000; ms += 250) {
			expect(identify(12.345 + ms / 1000, 'F').verdict).not.toBe('early');
		}
	});
});
