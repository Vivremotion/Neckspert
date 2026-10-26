import { Fraction, barLength, type Meter, type RoundPlan } from '$lib/domain/time';

/**
 * Where a round goes on the transport when nothing hands over to it (decisions D2, D3, L4): pure,
 * positions in transport bars (fractions of a bar allowed).
 */

/** The smallest multiple of `step` at or after `value`, exactly. */
function ceilTo(value: Fraction, step: Fraction): Fraction {
	const ratio = value.div(step);
	let whole = Math.ceil(ratio.toNumber());
	// The float quotient may round across an integer: settle it exactly.
	while (Fraction.of(whole).compare(ratio) < 0) whole++;
	while (Fraction.of(whole - 1).compare(ratio) >= 0) whole--;
	return Fraction.of(whole).mul(step);
}

/**
 * Where a timed round starts: the first place ≥ `earliest` that lies `barOffset` into a bar and,
 * when the count ends on the prompt (the default), whose prompt is not before `earliest`.
 */
export function timedStart(earliest: Fraction, plan: RoundPlan, meter: Meter): Fraction {
	const bar = barLength(meter);
	const offset = plan.barOffset ?? Fraction.ZERO;
	if (offset.compare(Fraction.ZERO) < 0 || offset.compare(bar) >= 0) {
		throw new RangeError('barOffset must lie within its bar');
	}
	let lowest = earliest;
	if ((plan.countEndsOn ?? 'prompt') === 'prompt') {
		// start + prompt ≥ earliest.
		const byPrompt = earliest.sub((plan.prompt ?? Fraction.ZERO).div(bar));
		if (byPrompt.compare(lowest) > 0) lowest = byPrompt;
	}
	const inBars = offset.div(bar);
	return ceilTo(lowest.sub(inBars), Fraction.of(1)).add(inBars);
}

/** A plan whose expectations are all in free time. */
export function inFreeTime(plan: RoundPlan): boolean {
	return plan.expectations.length > 0 && plan.expectations.every((e) => e.at === null);
}

/** The first beat at or after `earliest`, in bars. */
export function nextBeat(earliest: Fraction, meter: Meter): Fraction {
	return ceilTo(earliest, meter.unit.div(barLength(meter)));
}
