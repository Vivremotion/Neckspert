import type { Scene } from '$lib/domain/exercise/types';
import { Fraction, barLength, sameMeter, type Meter, type RoundPlan } from '$lib/domain/time';

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

/** What a round plays at, and the scene it is in. */
export interface PlacementSetting {
	tempo: number;
	meter: Meter;
	scene: Scene;
}

/** What the series plays at now: nothing yet (null) matches no round. */
export interface PlacementCurrent {
	tempo: number | null;
	meter: Meter;
	scene: Scene | null;
}

/** What `placeNext` decides from: the series as it stands and the round that comes. */
export interface PlacementContext {
	/** Where the round before ends (or the beat after its answer in free time), in bars. */
	earliest: Fraction;
	/** The round before hands over to the next one there. */
	handover: boolean;
	/** The bar at or after the audio clock now, in bars: a round never starts with its prompt before it. */
	nowBar: Fraction;
	current: PlacementCurrent;
	coming: PlacementSetting & { countIn: boolean; restBars: number };
	/** The plan of the coming round, in its own meter. */
	plan: RoundPlan;
	/**
	 * The first bar a counted bar may start on: audible (`audibleBar`), after `earliest` and after
	 * what is already accompanied.
	 */
	firstAudibleBar: number;
}

/** Where the next round goes. */
export type Placement =
	| { kind: 'chain'; start: Fraction }
	| { kind: 'after-breath'; start: Fraction }
	| { kind: 'next-beat'; start: Fraction }
	| {
			kind: 'count-in';
			fromBar: number;
			/** The tempo to change to, null when it stays. */
			tempo: number | null;
			/** The meter to change to, null when it stays. */
			meter: Meter | null;
			restBars: number;
	  };

/** Goes on without a gap: no counted bar asked, the same tempo, meter and scene. */
export function chainable(current: PlacementCurrent, coming: PlacementContext['coming']): boolean {
	return (
		!coming.countIn &&
		coming.tempo === current.tempo &&
		sameMeter(coming.meter, current.meter) &&
		coming.scene === current.scene
	);
}

/**
 * Where a round starts from `earliest`, never with its prompt already past (`nowBar`: the bar at
 * or after the audio clock): its plan's place (L4), or the next beat in free time (D3), a bar
 * later while the prompt would be past (a count that ends on a target far after its prompt).
 */
export function comingStart(
	plan: RoundPlan,
	meter: Meter,
	earliest: Fraction,
	nowBar: Fraction
): Fraction {
	const from = earliest.compare(nowBar) >= 0 ? earliest : nowBar;
	let start = inFreeTime(plan) ? nextBeat(from, meter) : timedStart(from, plan, meter);
	const bar = barLength(meter);
	const promptOf = (at: Fraction) => at.add((plan.prompt ?? Fraction.ZERO).div(bar));
	while (promptOf(start).compare(nowBar) < 0) start = start.add(Fraction.of(1));
	return start;
}

/**
 * Decides where the next round goes (D2, D3, L4), applying nothing: chained at the handover,
 * placed after the breath or on the next beat in free time when nothing asks a counted bar, else
 * a counted bar from the first audible bar, changing the tempo or the meter first when they differ.
 * A rest before the count is asked only by a count that changes nothing.
 */
export function placeNext(context: PlacementContext): Placement {
	const { current, coming } = context;
	if (chainable(current, coming)) {
		if (context.handover) return { kind: 'chain', start: context.earliest };
		return {
			kind: inFreeTime(context.plan) ? 'next-beat' : 'after-breath',
			start: comingStart(context.plan, current.meter, context.earliest, context.nowBar)
		};
	}
	const fromBar = context.firstAudibleBar;
	if (!sameMeter(coming.meter, current.meter)) {
		return { kind: 'count-in', fromBar, tempo: coming.tempo, meter: coming.meter, restBars: 0 };
	}
	if (coming.tempo !== current.tempo) {
		return { kind: 'count-in', fromBar, tempo: coming.tempo, meter: null, restBars: 0 };
	}
	return {
		kind: 'count-in',
		fromBar,
		tempo: null,
		meter: null,
		restBars: coming.countIn ? coming.restBars : 0
	};
}
