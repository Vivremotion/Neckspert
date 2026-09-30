import type { Answer, Verdict } from '$lib/domain/types';

/** Outcome of one prompt; J copies these fields into the Attempt. */
export interface Judgement {
	answer: Answer | null;
	correct: boolean;
	verdict: Verdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
}

export function unanswered(): Judgement {
	return { answer: null, correct: false, verdict: 'wrong', timingOffsetMs: null, reactionMs: null };
}

/** Whole milliseconds, rounded half away from zero so early and late stay symmetric; never -0. */
export function secondsToMs(seconds: number): number {
	const ms = Math.round(Math.abs(seconds) * 1000);
	return seconds < 0 && ms !== 0 ? -ms : ms;
}
