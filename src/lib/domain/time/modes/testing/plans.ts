import { Fraction } from '../../fraction';
import type { Expectation, RoundPlan } from '../../plan';
import { createTempoMap } from '../../tempoMap';

/** Hand-written plans and clocks for the specs of the round modes. Never imported by production code. */

export const F = Fraction.of;
export const quarter = F(1, 4);
/** A tempo map whose bar 0 starts at 0.1 s, in quarter notes. */
export const mapAt = (bpm: number) =>
	createTempoMap(0.1, [{ at: Fraction.ZERO, bpm, unit: quarter }]);
/** At 80 bpm a beat lasts 0.75 s: a round started at bar 2 has its target at 6.1 s. */
export const map = mapAt(80);

export function expectation(at: Fraction, span: Expectation['span'], sensor: string): Expectation {
	return {
		at,
		span,
		role: 'target',
		sensor,
		content: null,
		window: { ms: 80 },
		bar: 0
	};
}

/** A located note: the prompt a bar before the target, its late capture, then the breath. */
export function locatePlan(): RoundPlan {
	return {
		prompt: F(-1),
		expectations: [expectation(Fraction.ZERO, 'point', 'note')],
		length: F(1),
		listenUntil: F(3, 4),
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 300 },
				lateMs: 400,
				lateCapture: { ms: 2000 }
			}
		}
	};
}

/** The anchor of a triad: the root on the target, the chord over the rest of the bar. */
export function anchorPlan(): RoundPlan {
	const plan = locatePlan();
	return {
		...plan,
		expectations: [...plan.expectations, expectation(quarter, { until: F(1) }, 'chord')],
		length: F(2),
		listenUntil: F(7, 4)
	};
}

/** A grid change, opened early by its tolerance and handed over at the next one. */
export function gridPlan(): RoundPlan {
	return {
		prompt: F(-1, 4),
		expectations: [expectation(Fraction.ZERO, 'point', 'chord')],
		length: F(1),
		handover: F(1),
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { beforeMs: 200, maxBeats: 0.4 },
				lateMs: 400,
				lateCapture: 'to-end'
			}
		}
	};
}

/** A note named in free time: no tempo, answered any time after the prompt. */
export function freeTimePlan(): RoundPlan {
	return {
		...locatePlan(),
		prompt: null,
		expectations: [{ ...expectation(Fraction.ZERO, 'point', 'note'), at: null }]
	};
}
