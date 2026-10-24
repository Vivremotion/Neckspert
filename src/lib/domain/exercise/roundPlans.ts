import { Fraction } from '../time/fraction';
import { barLength, type Meter } from '../time/meter';
import type { Expectation, ExpectedContent, RoundPlan, RoundPolicy } from '../time/plan';
import {
	LATE_CAPTURE_MS,
	LATE_LIMIT_MS,
	MIN_RESPONSE_MS,
	PERFECT_WINDOW_MS
} from '../scoring/timing';
import { STRING_PREVIEW_BEATS } from '../timing/grid';
import { ANCHOR_CHORD_FROM_BEATS } from '../timing/anchor';
import { GRID_EARLY_MAX_BEATS, GRID_EARLY_MS } from '../timing/gridChange';
import type { LeadBeats } from '../types';

/**
 * The four one-answer relations written as round plans. A round starts at its target
 * (position 0); a « beat » is the meter's unit.
 */

const beats = (meter: Meter, count: number): Fraction => meter.unit.mul(Fraction.of(count));

function pointTarget(sensor: string, content: ExpectedContent, windowMs: number): Expectation {
	return {
		at: Fraction.ZERO,
		span: 'point',
		role: 'target',
		sensor,
		content,
		window: { ms: windowMs },
		bar: 0
	};
}

/** Locate on the beat: the prompt `leadBeats` before the target, then the breathing bars. */
function onTheBeatPolicy(correction: boolean): RoundPolicy {
	return {
		unit: 'response',
		verdict: 'response',
		correction,
		pairing: {
			mode: 'first-answer',
			opens: { afterPromptMs: MIN_RESPONSE_MS },
			lateMs: LATE_LIMIT_MS,
			lateCapture: { ms: LATE_CAPTURE_MS }
		}
	};
}

export function beatPlan(input: {
	content: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
}): RoundPlan {
	const { content, leadBeats, meter, respirationBars } = input;
	const length = barLength(meter).mul(Fraction.of(respirationBars));
	return {
		prompt: beats(meter, -leadBeats),
		expectations: [pointTarget('note', content, PERFECT_WINDOW_MS)],
		length,
		listenUntil: length.sub(beats(meter, STRING_PREVIEW_BEATS)),
		mutedBars: [],
		policy: onTheBeatPolicy(false)
	};
}

export function anchorPlan(input: {
	root: ExpectedContent;
	chord: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
}): RoundPlan {
	const { root, chord, leadBeats, meter, respirationBars } = input;
	const bar = barLength(meter);
	const length = bar.mul(Fraction.of(1 + respirationBars));
	return {
		prompt: beats(meter, -leadBeats),
		expectations: [
			pointTarget('note', root, PERFECT_WINDOW_MS),
			{
				at: beats(meter, ANCHOR_CHORD_FROM_BEATS),
				span: { until: bar },
				role: 'target',
				sensor: 'chord',
				content: chord,
				window: { ms: PERFECT_WINDOW_MS },
				bar: 0
			}
		],
		length,
		listenUntil: length.sub(beats(meter, STRING_PREVIEW_BEATS)),
		mutedBars: [],
		policy: onTheBeatPolicy(true)
	};
}

/** One change of a grid: opened a little early, handed over at its length. */
export function gridChangePlan(input: {
	content: ExpectedContent;
	lengthBeats: number;
	meter: Meter;
}): RoundPlan {
	const { content, lengthBeats, meter } = input;
	const length = beats(meter, lengthBeats);
	return {
		prompt: beats(meter, -1),
		expectations: [pointTarget('chord', content, PERFECT_WINDOW_MS)],
		length,
		handover: length,
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { beforeMs: GRID_EARLY_MS, maxBeats: GRID_EARLY_MAX_BEATS },
				lateMs: LATE_LIMIT_MS,
				lateCapture: 'to-end'
			}
		}
	};
}

/** A note named in free time (identify): answered any time after the prompt, no tempo. */
export function freePlan(input: {
	content: ExpectedContent;
	recallThresholdMs: number;
}): RoundPlan {
	return {
		prompt: Fraction.ZERO,
		expectations: [{ ...pointTarget('tap', input.content, input.recallThresholdMs), at: null }],
		length: Fraction.of(1),
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 0 },
				lateMs: 0,
				lateCapture: null
			}
		}
	};
}
