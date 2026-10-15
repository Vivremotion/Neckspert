import { Fraction } from '../fraction';
import type { Expectation, RoundPlan } from '../plan';
import type { TempoMap } from '../tempoMap';

/** The widest an attack may stand from an expectation and still be paired with it, in whole notes. */
export const MATCH_LIMIT = Fraction.of(1, 16);
/** Matches a shifted alignment must gain over the plain one before the judge calls it a shift. */
export const SHIFT_MIN_MATCHES = 3;

/** Float tolerance on seconds and costs: ties are decided by rule, not by rounding noise. */
const EPSILON = 1e-9;

export interface TimedExpectation {
	/** Index of the expectation in its plan. */
	index: number;
	/** Seconds on the tempo map. */
	time: number;
	/** How far an attack may stand from it and still be paired with it, in seconds. */
	zoneS: number;
	/** How far an attack may stand from it and still be on time, in seconds; never above `zoneS`. */
	windowS: number;
	/** Bar of the cycle, from 0. */
	bar: number;
	/** The plan's window was wider than the zone and was brought down to it. */
	clamped?: boolean;
}

export type ExpectationVerdict = 'on-time' | 'early' | 'late' | 'missed';

/**
 * Every timed expectation ends up in exactly one of `pairs`, `missed` and `dropped`. After a
 * shift, `offsetMs` is measured from the moved expectation (where the player now stands), not
 * from the written one.
 */
export interface Alignment {
	pairs: {
		expectation: number;
		attack: number;
		offsetMs: number;
		verdict: Exclude<ExpectationVerdict, 'missed'>;
	}[];
	/** Plan indexes of the expectations no attack answered. */
	missed: number[];
	/**
	 * Plan indexes of the expectations a shift made unplayable in this round (moved outside it,
	 * or covered by the moved bar): neither answered nor missed. Empty without a shift.
	 */
	dropped: number[];
	/** Indexes (in the attacks given) of the attacks that answer no expectation, in time order. */
	extra: number[];
	/** Where the player lost or added time, and by how much: the expectations from `bar` on were heard `byS` seconds later (earlier when negative). */
	shift: { bar: number; byS: number } | null;
	/** Windows brought down to the zone (half the gap to a neighbour, or `MATCH_LIMIT`). */
	clampedWindows: number;
}

/**
 * What the shift search needs beyond the timed expectations: the steps it tries and the span
 * of the round, in seconds. A shift is tried by a beat (`beatS`, when known), then by the
 * smallest subdivision (`subdivisionS`), each forward then backward. Expectations a shift
 * moves outside the round's span cannot be played in it: `[startS, endS)` moved by `leadInS`. Build it with
 * `alignContext(plan, map, startPosition)`; it is required so that no caller can align
 * without looking for a lost or added beat.
 */
export interface AlignContext {
	beatS: number | null;
	subdivisionS: number | null;
	startS: number;
	endS: number;
	/**
	 * How far before `startS` the round already listens, in seconds (default 0; negative when it
	 * listens later): when the plan loops, see `captureLeadIn`. The span of the round for the
	 * shift search is then `[startS - leadInS, endS - leadInS)`.
	 */
	leadInS?: number;
}

/** The tempo segment that holds at `position` (the first one also holds before it starts). */
function segmentAt(map: TempoMap, position: Fraction) {
	let segment = map.segments[0];
	for (const s of map.segments) if (s.at.compare(position) <= 0) segment = s;
	return segment;
}

/** Seconds that `length` lasts from `position`, forward (or backward when `length` is negative). */
function secondsOf(map: TempoMap, position: Fraction, length: Fraction): number {
	return Math.abs(map.toSeconds(position.add(length)) - map.toSeconds(position));
}

function targets(plan: RoundPlan): { e: Expectation; index: number }[] {
	return plan.expectations.map((e, index) => ({ e, index })).filter(({ e }) => e.role === 'target');
}

/**
 * Expectations timed by the map: zone = min(half gaps to neighbours, MATCH_LIMIT), window = min(window, zone).
 *
 * Only targets are timed: a judged rest asks for silence, not for an attack, and is left to its
 * own judge; neighbours are the targets either side. `MATCH_LIMIT` is measured on the map both
 * ways from the expectation, the shorter kept. A window `{ ofGap }` is that share of the gap to
 * the nearer neighbour (twice `MATCH_LIMIT` for a lone target). A window wider than the zone is
 * brought down to it and marked `clamped`.
 */
export function timeExpectations(
	plan: RoundPlan,
	map: TempoMap,
	startPosition: Fraction
): TimedExpectation[] {
	const list = targets(plan);
	const positions = list.map(({ e }) => startPosition.add(e.at));
	const times = positions.map((p) => map.toSeconds(p));
	return list.map(({ e, index }, i) => {
		const limit = Math.min(
			secondsOf(map, positions[i], MATCH_LIMIT),
			secondsOf(map, positions[i], Fraction.ZERO.sub(MATCH_LIMIT))
		);
		const gaps: number[] = [];
		if (i > 0) gaps.push(times[i] - times[i - 1]);
		if (i + 1 < list.length) gaps.push(times[i + 1] - times[i]);
		const gap = gaps.length > 0 ? Math.min(...gaps) : 2 * limit;
		const zoneS = Math.min(gap / 2, limit);
		const asked = 'ms' in e.window ? e.window.ms / 1000 : e.window.ofGap.toNumber() * gap;
		const clamped = asked > zoneS + EPSILON;
		return {
			index,
			time: times[i],
			zoneS,
			windowS: clamped ? zoneS : asked,
			bar: e.bar,
			clamped
		};
	});
}

/**
 * The shift search context of a round: the beat is the unit of the tempo segment holding at
 * `startPosition` (the beat the metronome counts, so a dotted quarter in 6/8), the smallest
 * subdivision is the smallest gap between two targets of the plan (the figure's attacks;
 * ties already merged), both measured on the map from `startPosition`. The span is the
 * round's, from `startPosition` to `startPosition + plan.length`.
 */
export function alignContext(
	plan: RoundPlan,
	map: TempoMap,
	startPosition: Fraction
): AlignContext {
	const beatS = secondsOf(map, startPosition, segmentAt(map, startPosition).unit);
	let smallest: Fraction | null = null;
	const list = targets(plan);
	for (let i = 1; i < list.length; i++) {
		const gap = list[i].e.at.sub(list[i - 1].e.at);
		if (gap.n > 0 && (!smallest || gap.compare(smallest) < 0)) smallest = gap;
	}
	return {
		beatS,
		subdivisionS: smallest ? secondsOf(map, startPosition, smallest) : null,
		startS: map.toSeconds(startPosition),
		endS: map.toSeconds(startPosition.add(plan.length)),
		leadInS: captureLeadIn(plan, map, startPosition)
	};
}

/**
 * How early, in seconds, the round of a looping plan starts to listen, measured from the bar
 * start: the zone before its first target, so that a downbeat played a little early is the next
 * cycle's, not the previous one's added attack. It is the shortest of `MATCH_LIMIT` (measured on
 * the map from `startPosition`), half the gap between the last target and the first one of the
 * next loop, and the first target's own zone (an attack farther than that pairs with nothing).
 * Cycles of one plan chained end to end then tile time: each captures `[start - lead, end - lead)`.
 *
 * It is also bounded by the last target, so that an attack within that target's zone after it
 * stays in this cycle: the window must end at least that zone after the last target, i.e.
 * `lead <= (end - lastTime) - min(zone of the last target, half the loop gap)`. The bound can
 * make the lead negative: a last target closer to the end than its zone pushes the window's start
 * after the bar start. Zero when the plan does not loop (its `handover` is not its length) or
 * has no target.
 */
export function captureLeadIn(plan: RoundPlan, map: TempoMap, startPosition: Fraction): number {
	if (!plan.handover || !plan.handover.equals(plan.length)) return 0;
	const list = targets(plan);
	if (list.length === 0) return 0;
	const timed = timeExpectations(plan, map, startPosition);
	const limit = Math.min(
		secondsOf(map, startPosition, MATCH_LIMIT),
		secondsOf(map, startPosition, Fraction.ZERO.sub(MATCH_LIMIT))
	);
	const lastTime = map.toSeconds(startPosition.add(list[list.length - 1].e.at));
	const endTime = map.toSeconds(startPosition.add(plan.length));
	const nextFirstTime = map.toSeconds(startPosition.add(plan.length).add(list[0].e.at));
	const halfLoopGap = (nextFirstTime - lastTime) / 2;
	const before = Math.min(limit, halfLoopGap, timed[0].zoneS);
	const afterLast = Math.min(timed[timed.length - 1].zoneS, halfLoopGap);
	return Math.min(before, endTime - lastTime - afterLast);
}

interface Attack {
	time: number;
	index: number;
}

interface Path {
	pairs: Alignment['pairs'];
	missed: number[];
	extra: number[];
}

function verdictOf(offsetS: number, windowS: number): Exclude<ExpectationVerdict, 'missed'> {
	if (Math.abs(offsetS) <= windowS + EPSILON) return 'on-time';
	return offsetS < 0 ? 'early' : 'late';
}

/**
 * The monotone alignment of least cost. Pairing costs |offset| / zone and is allowed only
 * inside the zone (so at most 1); leaving an expectation unanswered or an attack unpaired
 * costs 1 each. Ties are broken while walking back from the end: a pair first, then a missed
 * expectation, then an extra attack. So an attack exactly between two expectations goes to
 * the later one (heard early rather than late).
 */
function optimalPath(expectations: TimedExpectation[], attacks: Attack[]): Path {
	const n = expectations.length;
	const m = attacks.length;
	const width = m + 1;
	const cost = new Float64Array((n + 1) * width);
	const pairCost = (i: number, j: number): number | null => {
		const e = expectations[i - 1];
		const offset = Math.abs(attacks[j - 1].time - e.time);
		if (offset > e.zoneS + EPSILON) return null;
		return e.zoneS > 0 ? offset / e.zoneS : 0;
	};
	for (let i = 0; i <= n; i++) {
		for (let j = 0; j <= m; j++) {
			if (i === 0 || j === 0) {
				cost[i * width + j] = i + j;
				continue;
			}
			let best = Math.min(cost[(i - 1) * width + j], cost[i * width + j - 1]) + 1;
			const c = pairCost(i, j);
			if (c !== null) best = Math.min(best, cost[(i - 1) * width + j - 1] + c);
			cost[i * width + j] = best;
		}
	}
	const path: Path = { pairs: [], missed: [], extra: [] };
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		const here = cost[i * width + j];
		const c = i > 0 && j > 0 ? pairCost(i, j) : null;
		if (c !== null && Math.abs(cost[(i - 1) * width + j - 1] + c - here) <= EPSILON) {
			const e = expectations[i - 1];
			const offsetS = attacks[j - 1].time - e.time;
			path.pairs.push({
				expectation: e.index,
				attack: attacks[j - 1].index,
				offsetMs: offsetS * 1000,
				verdict: verdictOf(offsetS, e.windowS)
			});
			i--;
			j--;
		} else if (i > 0 && Math.abs(cost[(i - 1) * width + j] + 1 - here) <= EPSILON) {
			path.missed.push(expectations[i - 1].index);
			i--;
		} else {
			path.extra.push(attacks[j - 1].index);
			j--;
		}
	}
	path.pairs.reverse();
	path.missed.reverse();
	path.extra.reverse();
	return path;
}

/**
 * The expectations as they stand if the player moved by `byS` from bar `bar` on: the earlier
 * bars stay, the later ones move. Expectations made unplayable by the move are left out: the
 * moved ones that fall outside the round, and (moving back) the earlier ones that the moved
 * bar now covers.
 */
function shifted(
	expectations: TimedExpectation[],
	bar: number,
	byS: number,
	context: AlignContext
): { playable: TimedExpectation[]; dropped: number[] } {
	const lead = context.leadInS ?? 0;
	const moved = expectations
		.filter((e) => e.bar >= bar)
		.map((e) => ({ ...e, time: e.time + byS }))
		.filter(
			(e) => e.time >= context.startS - lead - EPSILON && e.time < context.endS - lead - EPSILON
		);
	const first = moved[0]?.time ?? Infinity;
	const kept = expectations.filter((e) => e.bar < bar && e.time < first - EPSILON);
	const playable = [...kept, ...moved];
	const left = new Set(playable.map((e) => e.index));
	return { playable, dropped: expectations.filter((e) => !left.has(e.index)).map((e) => e.index) };
}

/**
 * Monotone optimal alignment (dynamic programming): match cost |offset| / zone, insertion and deletion cost 1.
 *
 * Then the shift search: for each bar of the cycle (in order) and each step of the context
 * (a beat forward and back, then the smallest subdivision forward and back), the attacks are
 * aligned again on the expectations moved by that step from that bar on. A move that gains at
 * least `SHIFT_MIN_MATCHES` pairs over the plain alignment qualifies; among those, the one that
 * gains most wins, the earliest bar then the earlier step on a tie. (Keeping the first
 * qualifying bar alone would name the bar before the real one: moving one bar too early loses
 * a few pairs in it but still gains enough after.) The moved alignment is returned; the
 * expectations the move made unplayable are listed in `dropped`, neither paired nor missed.
 * Attacks may come in
 * any order; their indexes are kept.
 */
export function alignAttacks(
	expectations: TimedExpectation[],
	attacks: number[],
	context: AlignContext
): Alignment {
	const sorted = [...expectations].sort((a, b) => a.time - b.time);
	const timed: Attack[] = attacks
		.map((time, index) => ({ time, index }))
		.sort((a, b) => a.time - b.time || a.index - b.index);
	const clampedWindows = expectations.filter((e) => e.clamped).length;

	const plain = optimalPath(sorted, timed);
	let best: { path: Path; dropped: number[]; bar: number; byS: number; gain: number } | null = null;
	if (timed.length > 0) {
		const steps = [context.beatS, context.subdivisionS]
			.filter((s): s is number => s !== null && s > EPSILON)
			.filter((s, i, all) => all.findIndex((t) => Math.abs(t - s) <= EPSILON) === i)
			.flatMap((s) => [s, -s]);
		const bars = [...new Set(sorted.map((e) => e.bar))].sort((a, b) => a - b);
		for (const bar of bars) {
			for (const byS of steps) {
				const { playable, dropped } = shifted(sorted, bar, byS, context);
				const path = optimalPath(playable, timed);
				const gain = path.pairs.length - plain.pairs.length;
				if (gain >= SHIFT_MIN_MATCHES && (!best || gain > best.gain)) {
					best = { path, dropped, bar, byS, gain };
				}
			}
		}
	}
	const chosen = best ? best.path : plain;
	return {
		pairs: chosen.pairs,
		missed: chosen.missed,
		dropped: best ? best.dropped : [],
		extra: chosen.extra,
		shift: best ? { bar: best.bar, byS: best.byS } : null,
		clampedWindows
	};
}
