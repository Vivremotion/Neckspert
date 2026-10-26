import { Fraction } from '../time/fraction';
import { barLength, type Meter } from '../time/meter';
import type { Expectation, ExpectedContent, RoundPlan, RoundPolicy } from '../time/plan';
import { STRING_PREVIEW_BEATS } from '../timing/grid';
import type { LeadBeats } from '../types';
import type { ResponseWindows } from './windows';

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
function onTheBeatPolicy(correction: boolean, windows: ResponseWindows): RoundPolicy {
	return {
		unit: 'response',
		verdict: 'response',
		correction,
		pairing: {
			mode: 'first-answer',
			opens: { afterPromptMs: windows.minResponseMs },
			lateMs: windows.lateMs,
			lateCapture: { ms: windows.lateCaptureMs }
		}
	};
}

export function beatPlan(input: {
	content: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
	/** The exercise's windows (`windowsOf`). */
	windows: ResponseWindows;
}): RoundPlan {
	const { content, leadBeats, meter, respirationBars, windows } = input;
	const length = barLength(meter).mul(Fraction.of(respirationBars));
	return {
		prompt: beats(meter, -leadBeats),
		expectations: [pointTarget('note', content, windows.perfectMs)],
		length,
		listenUntil: length.sub(beats(meter, STRING_PREVIEW_BEATS)),
		mutedBars: [],
		policy: onTheBeatPolicy(false, windows)
	};
}

export function anchorPlan(input: {
	root: ExpectedContent;
	chord: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
	windows: ResponseWindows;
}): RoundPlan {
	const { root, chord, leadBeats, meter, respirationBars, windows } = input;
	const bar = barLength(meter);
	const length = bar.mul(Fraction.of(1 + respirationBars));
	return {
		prompt: beats(meter, -leadBeats),
		expectations: [
			pointTarget('note', root, windows.perfectMs),
			{
				at: beats(meter, windows.anchorChordFromBeats),
				span: { until: bar },
				role: 'target',
				sensor: 'chord',
				content: chord,
				window: { ms: windows.perfectMs },
				bar: 0
			}
		],
		length,
		listenUntil: length.sub(beats(meter, STRING_PREVIEW_BEATS)),
		mutedBars: [],
		policy: onTheBeatPolicy(true, windows)
	};
}

/** One change of a grid: opened a little early, handed over at its length. */
export function gridChangePlan(input: {
	content: ExpectedContent;
	lengthBeats: number;
	meter: Meter;
	windows: ResponseWindows;
}): RoundPlan {
	const { content, lengthBeats, meter, windows } = input;
	const length = beats(meter, lengthBeats);
	return {
		prompt: beats(meter, -1),
		expectations: [pointTarget('chord', content, windows.perfectMs)],
		length,
		handover: length,
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { beforeMs: windows.gridEarlyMs, maxBeats: windows.gridEarlyMaxBeats },
				lateMs: windows.lateMs,
				lateCapture: 'to-end'
			}
		}
	};
}

/**
 * A note named in free time (identify): answered any time after the prompt, no tempo. It takes no
 * `windows`: it opens at the prompt and has no late zone; its window is the recall threshold.
 */
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
