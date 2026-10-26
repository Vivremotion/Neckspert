import { Fraction, barLength, type Meter, type RoundPlan } from '$lib/domain/time';

/**
 * Where a round goes on the transport when nothing hands over to it (decisions D2, D3): pure,
 * positions in transport bars (fractions of a bar allowed).
 */

/** A prompt may come this many beats before the earliest bar (D2: a grid opens a beat before its change). */
export const PROMPT_BEFORE_EARLIEST_BEATS = 1;

/** The smallest multiple of `step` at or after `value`, exactly. */
function ceilTo(value: Fraction, step: Fraction): Fraction {
	const ratio = value.div(step);
	let whole = Math.ceil(ratio.toNumber());
	// The float quotient may round across an integer: settle it exactly.
	while (Fraction.of(whole).compare(ratio) < 0) whole++;
	while (Fraction.of(whole - 1).compare(ratio) >= 0) whole--;
	return Fraction.of(whole).mul(step);
}

/** The bar a timed round starts on: the first whole bar ≥ `earliest` whose prompt falls at most `PROMPT_BEFORE_EARLIEST_BEATS` beats before `earliest`. */
export function timedStart(earliest: Fraction, plan: RoundPlan, meter: Meter): Fraction {
	const bar = barLength(meter);
	const prompt = (plan.prompt ?? Fraction.ZERO).div(bar);
	const tolerance = meter.unit.mul(Fraction.of(PROMPT_BEFORE_EARLIEST_BEATS)).div(bar);
	// start + prompt ≥ earliest − tolerance, and start ≥ earliest.
	const byPrompt = earliest.sub(tolerance).sub(prompt);
	const lowest = byPrompt.compare(earliest) > 0 ? byPrompt : earliest;
	return ceilTo(lowest, Fraction.of(1));
}

/** A plan whose expectations are all in free time. */
export function inFreeTime(plan: RoundPlan): boolean {
	return plan.expectations.length > 0 && plan.expectations.every((e) => e.at === null);
}

/** The first beat at or after `earliest`, in bars. */
export function nextBeat(earliest: Fraction, meter: Meter): Fraction {
	return ceilTo(earliest, meter.unit.div(barLength(meter)));
}
