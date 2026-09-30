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
