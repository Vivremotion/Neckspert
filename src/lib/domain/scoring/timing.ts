import type { Midi } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';
import { secondsToMs, unanswered, type Judgement } from './judgement';

/** Largest |offset| from the target beat still judged perfect. To calibrate. */
export const PERFECT_WINDOW_MS = 80;

/** How long after the target beat a note is still taken as the answer. To calibrate. */
export const LATE_LIMIT_MS = 400;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

type AnswerWindow = { opensAt: number; closesAt: number };

/** Times in audio seconds. */
export function answerWindow(promptTime: number, targetTime: number): AnswerWindow {
	return { opensAt: promptTime, closesAt: targetTime + LATE_LIMIT_MS / 1000 };
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
 * An onset outside the window counts as no answer.
 */
export function judgeLocate(input: {
	acceptable: readonly Midi[];
	promptTime: number;
	targetTime: number;
	onset: { time: number; midi: Midi } | null;
	latencyMs: number;
}): Judgement {
	const { acceptable, promptTime, targetTime, onset, latencyMs } = input;
	if (onset === null) return unanswered();
	const corrected = onset.time - latencyMs / 1000;
	if (!isInWindow(corrected, answerWindow(promptTime, targetTime))) return unanswered();
	const correct = acceptable.includes(onset.midi);
	const timingOffsetMs = secondsToMs(corrected - targetTime);
	return {
		answer: { kind: 'note', midi: onset.midi },
		correct,
		verdict: correct ? timingVerdict(timingOffsetMs) : 'wrong',
		timingOffsetMs,
		reactionMs: secondsToMs(corrected - promptTime)
	};
}

function timingVerdict(offsetMs: number): Verdict {
	if (Math.abs(offsetMs) <= PERFECT_WINDOW_MS) return 'perfect';
	return offsetMs < 0 ? 'early' : 'late';
}
