import type { Midi } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';
import { secondsToMs, unanswered, type Judgement } from './judgement';

/** Largest |offset| from the target beat still judged perfect. To calibrate. */
export const PERFECT_WINDOW_MS = 80;

/** How long after the target beat a note is still taken as the answer. To calibrate. */
export const LATE_LIMIT_MS = 400;

/**
 * How long past LATE_LIMIT_MS the detector keeps listening: a right note there is `offbeat`,
 * found but too late. Bounded by the next prompt (`lateCaptureEnd`). To calibrate.
 */
export const LATE_CAPTURE_MS = 2000;

/**
 * Notes in the first MIN_RESPONSE_MS after a prompt (or before it) belong to the previous
 * prompt: too early to be an answer to this one. To calibrate.
 */
export const MIN_RESPONSE_MS = 300;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

type AnswerWindow = { opensAt: number; closesAt: number };

/** Times in audio seconds. Opens MIN_RESPONSE_MS after the prompt. */
export function answerWindow(promptTime: number, targetTime: number): AnswerWindow {
	return {
		opensAt: promptTime + MIN_RESPONSE_MS / 1000,
		closesAt: targetTime + LATE_LIMIT_MS / 1000
	};
}

/**
 * End of the off-beat capture, in audio seconds: LATE_CAPTURE_MS past the window, but never
 * after `nextPromptTime`, the earliest moment the next prompt can appear.
 */
export function lateCaptureEnd(targetTime: number, nextPromptTime: number): number {
	return Math.min(targetTime + (LATE_LIMIT_MS + LATE_CAPTURE_MS) / 1000, nextPromptTime);
}

/** Both edges are inside. */
export function isInWindow(correctedTime: number, window: AnswerWindow): boolean {
	return (
		correctedTime >= window.opensAt - EDGE_TOLERANCE_S &&
		correctedTime <= window.closesAt + EDGE_TOLERANCE_S
	);
}

/**
 * Times in audio seconds. `onset.time` is raw; latencyMs is subtracted.
 * Inside the window: timed verdict. After it, up to `captureUntil` (default: no capture): a
 * right note is `offbeat`, a wrong one stays wrong. Anywhere else: no answer.
 */
export function judgeLocate(input: {
	acceptable: readonly Midi[];
	promptTime: number;
	targetTime: number;
	onset: { time: number; midi: Midi } | null;
	latencyMs: number;
	captureUntil?: number;
}): Judgement {
	const { acceptable, promptTime, targetTime, onset, latencyMs } = input;
	if (onset === null) return unanswered();
	const corrected = onset.time - latencyMs / 1000;
	const window = answerWindow(promptTime, targetTime);
	const inWindow = isInWindow(corrected, window);
	const captured =
		!inWindow &&
		input.captureUntil !== undefined &&
		corrected > window.closesAt &&
		corrected <= input.captureUntil + EDGE_TOLERANCE_S;
	if (!inWindow && !captured) return unanswered();
	const correct = acceptable.includes(onset.midi);
	const timingOffsetMs = secondsToMs(corrected - targetTime);
	return {
		answer: { kind: 'note', midi: onset.midi },
		correct,
		verdict: !correct ? 'wrong' : captured ? 'offbeat' : timingVerdict(timingOffsetMs),
		timingOffsetMs,
		reactionMs: secondsToMs(corrected - promptTime)
	};
}

export function timingVerdict(offsetMs: number): Verdict {
	if (Math.abs(offsetMs) <= PERFECT_WINDOW_MS) return 'perfect';
	return offsetMs < 0 ? 'early' : 'late';
}
