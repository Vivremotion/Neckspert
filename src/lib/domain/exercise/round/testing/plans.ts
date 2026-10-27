import { Fraction } from '../../../time/fraction';
import type { Expectation, RoundPolicy } from '../../../time/plan';

/**
 * Hand-written pieces of the plans the catalog's templates compile to, with today's windows
 * written out: 80 ms on the beat, an answer open 300 ms after the prompt, late past 400 ms, then
 * 2 s of capture; a grid change opens 200 ms (0.4 beat at most) early. Never imported by
 * production code.
 */

/** A point expectation at `at` (the target by default; null: free time). */
export const pointAt = (
	sensor: string,
	content: Expectation['content'],
	at: Fraction | null = Fraction.ZERO
): Expectation => ({
	at,
	span: 'point',
	role: 'target',
	sensor,
	content,
	window: { ms: 80 },
	bar: 0
});

/** A note or chord answered on the beat: the first answer counts, a late one is captured. */
export const onTheBeat = (correction: boolean): RoundPolicy => ({
	unit: 'response',
	verdict: 'response',
	correction,
	pairing: {
		mode: 'first-answer',
		opens: { afterPromptMs: 300 },
		lateMs: 400,
		lateCapture: { ms: 2000 }
	}
});

/** A change of a grid: opened a little early, a late answer captured to the end. */
export const gridChange: RoundPolicy = {
	unit: 'response',
	verdict: 'response',
	correction: false,
	pairing: {
		mode: 'first-answer',
		opens: { beforeMs: 200, maxBeats: 0.4 },
		lateMs: 400,
		lateCapture: 'to-end'
	}
};

/** A note named in free time: answered any time after the prompt. */
export const freeTime: RoundPolicy = {
	unit: 'response',
	verdict: 'response',
	correction: false,
	pairing: { mode: 'first-answer', opens: { afterPromptMs: 0 }, lateMs: 0, lateCapture: null }
};
