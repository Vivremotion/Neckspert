import type { Verdict } from '$lib/domain/types';

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

export function timingVerdict(offsetMs: number): Verdict {
	if (Math.abs(offsetMs) <= PERFECT_WINDOW_MS) return 'perfect';
	return offsetMs < 0 ? 'early' : 'late';
}

/** Whole milliseconds, rounded half away from zero so early and late stay symmetric; never -0. */
export function secondsToMs(seconds: number): number {
	const ms = Math.round(Math.abs(seconds) * 1000);
	return seconds < 0 && ms !== 0 ? -ms : ms;
}
