import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import type { Figure, FigureElement } from '../figure';
import { METER_4_4 } from '../meter';
import {
	compileCyclePlan,
	type Expectation,
	type ExpectationWindow,
	type RoundPlan
} from '../plan';
import { createTempoMap } from '../tempoMap';
import {
	alignAttacks,
	alignContext,
	MATCH_LIMIT,
	SHIFT_MIN_MATCHES,
	timeExpectations,
	type TimedExpectation
} from './align';

const of = Fraction.of;

/** One bar of 4/4 in steps of `step` (1/8 or 1/16): a note where the pattern says 1, a rest at 0. */
function bar(pattern: string, step: Fraction): Figure {
	const elements: FigureElement[] = [...pattern].map((c) =>
		c === '1' ? { kind: 'note', duration: step, content: null } : { kind: 'rest', duration: step }
	);
	return { schema: 1, meter: METER_4_4, bars: 1, voices: [{ id: 'main', elements }] };
}

function cycle(
	pattern: string,
	cycleBars: number,
	window: ExpectationWindow,
	step = of(1, 8)
): RoundPlan {
	return compileCyclePlan({
		figure: bar(pattern, step),
		cycleBars,
		startBar: 0,
		sensor: 'attack',
		window,
		accompanimentBars: ['on']
	});
}

const quarterAt = (bpm: number) => createTempoMap(0, [{ at: Fraction.ZERO, bpm, unit: of(1, 4) }]);

// ♩ = 100 bpm: an eighth lasts 0.3 s, a beat 0.6 s, a bar 2.4 s, MATCH_LIMIT 0.15 s.
const map100 = quarterAt(100);
const EIGHTH = 0.3;

describe('constants', () => {
	it('match within a sixteenth and need three matches to call a shift', () => {
		expect(MATCH_LIMIT.equals(of(1, 16))).toBe(true);
		expect(SHIFT_MIN_MATCHES).toBe(3);
	});
});

describe('timeExpectations', () => {
	it('times every target from the start position through the tempo map', () => {
		const plan = cycle('11111111', 1, { ms: 20 });
		const timed = timeExpectations(plan, map100, of(1)); // the round opens on bar 2
		expect(timed.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(timed[0].time).toBeCloseTo(2.4);
		expect(timed[3].time).toBeCloseTo(2.4 + 3 * EIGHTH);
		expect(timed.every((e) => e.bar === 0)).toBe(true);
		expect(timed.every((e) => Math.abs(e.zoneS - 0.15) < 1e-9)).toBe(true);
		expect(timed.every((e) => Math.abs(e.windowS - 0.02) < 1e-9 && !e.clamped)).toBe(true);
	});

	it('bounds the zone by half the gap to the nearest neighbour, and by MATCH_LIMIT', () => {
		// Sixteenths 1 1 0 0 1: gaps 0.15 s then 0.45 s; half gaps 0.075 s and 0.225 s.
		const plan = cycle('1100100000000000', 1, { ms: 20 }, of(1, 16));
		const timed = timeExpectations(plan, map100, Fraction.ZERO);
		expect(timed.map((e) => e.zoneS)).toEqual([0.075, 0.075, 0.15].map((z) => expect.closeTo(z)));
		// A lone note far from the others keeps MATCH_LIMIT.
		const lone = timeExpectations(cycle('10000000', 1, { ms: 20 }), map100, Fraction.ZERO);
		expect(lone[0].zoneS).toBeCloseTo(0.15);
	});

	it('reads a window relative to the local gap', () => {
		const timed = timeExpectations(
			cycle('11111111', 1, { ofGap: of(1, 4) }),
			map100,
			Fraction.ZERO
		);
		expect(timed.every((e) => Math.abs(e.windowS - 0.075) < 1e-9)).toBe(true);
	});

	it('clamps a window too wide for sixteenths at ♩ = 160 bpm to half the gap', () => {
		// ♩ = 160 bpm: a sixteenth lasts 0.09375 s, half of it 0.046875 s; the window asks 80 ms.
		const plan = cycle('1111111111111111', 1, { ms: 80 }, of(1, 16));
		const timed = timeExpectations(plan, quarterAt(160), Fraction.ZERO);
		expect(timed).toHaveLength(16);
		for (const e of timed) {
			expect(e.windowS).toBeLessThanOrEqual(0.09375 / 2 + 1e-12);
			expect(e.windowS).toBeLessThanOrEqual(e.zoneS);
			expect(e.clamped).toBe(true);
		}
		expect(alignAttacks(timed, []).clampedWindows).toBe(16);
	});

	it('leaves judged rests out and keeps the plan indexes of the targets', () => {
		const plan = cycle('11110000', 1, { ms: 20 });
		const rest: Expectation = { ...plan.expectations[1], role: 'judged-rest' };
		const withRest: RoundPlan = {
			...plan,
			expectations: [plan.expectations[0], rest, plan.expectations[2], plan.expectations[3]]
		};
		const timed = timeExpectations(withRest, map100, Fraction.ZERO);
		expect(timed.map((e) => e.index)).toEqual([0, 2, 3]);
	});
});

describe('alignContext', () => {
	it('gives the beat of the tempo map, the smallest gap of the plan and the round span', () => {
		const plan = cycle('11010000', 2, { ms: 20 });
		const context = alignContext(plan, map100, of(1));
		expect(context.beatS).toBeCloseTo(0.6);
		expect(context.subdivisionS).toBeCloseTo(0.3);
		expect(context.startS).toBeCloseTo(2.4);
		expect(context.endS).toBeCloseTo(2.4 + 4.8);
	});
});

/** The attack times of a plan played exactly, optionally moved. */
function played(timed: TimedExpectation[], move: (e: TimedExpectation) => number = () => 0) {
	return timed.map((e) => e.time + move(e));
}

describe('alignAttacks', () => {
	const eighths = timeExpectations(cycle('11111111', 1, { ms: 20 }), map100, Fraction.ZERO);

	it('pairs exact attacks on time', () => {
		const alignment = alignAttacks(eighths, played(eighths));
		expect(alignment.pairs).toHaveLength(8);
		expect(alignment.pairs.every((p) => p.verdict === 'on-time')).toBe(true);
		expect(alignment.pairs.map((p) => [p.expectation, p.attack])).toEqual(
			[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, i])
		);
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.shift).toBeNull();
		expect(alignment.clampedWindows).toBe(0);
	});

	it('calls attacks 30 ms ahead early when the window is 20 ms', () => {
		const alignment = alignAttacks(
			eighths,
			played(eighths, () => -0.03)
		);
		expect(alignment.pairs).toHaveLength(8);
		for (const pair of alignment.pairs) {
			expect(pair.verdict).toBe('early');
			expect(pair.offsetMs).toBeCloseTo(-30);
		}
	});

	it('calls attacks 30 ms behind late', () => {
		const alignment = alignAttacks(
			eighths,
			played(eighths, () => 0.03)
		);
		expect(alignment.pairs.every((p) => p.verdict === 'late')).toBe(true);
		expect(alignment.pairs[0].offsetMs).toBeCloseTo(30);
	});

	it('lists a missing eighth as missed', () => {
		const attacks = played(eighths).filter((_, i) => i !== 3);
		const alignment = alignAttacks(eighths, attacks);
		expect(alignment.missed).toEqual([3]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.pairs).toHaveLength(7);
		expect(alignment.pairs.every((p) => p.verdict === 'on-time')).toBe(true);
		expect(alignment.shift).toBeNull();
	});

	it('lists an attack in the middle of a rest as extra', () => {
		// 1 1 0 1 0 1 0 1: an attack lands on the third eighth, a rest.
		const timed = timeExpectations(cycle('11010101', 1, { ms: 20 }), map100, Fraction.ZERO);
		const attacks = [...played(timed), 2 * EIGHTH].sort((a, b) => a - b);
		const alignment = alignAttacks(timed, attacks);
		expect(alignment.extra).toEqual([2]);
		expect(alignment.missed).toEqual([]);
		expect(alignment.pairs).toHaveLength(5);
	});

	it('never pairs an attack outside the zone of an expectation', () => {
		// 0.2 s late on an eighth: beyond the 0.15 s zone, a miss and an extra.
		const lone = timeExpectations(cycle('10000000', 1, { ms: 20 }), map100, Fraction.ZERO);
		const alignment = alignAttacks(lone, [0.2]);
		expect(alignment.pairs).toEqual([]);
		expect(alignment.missed).toEqual([0]);
		expect(alignment.extra).toEqual([0]);
	});

	it('misses every expectation when nothing is played', () => {
		const alignment = alignAttacks(eighths, []);
		expect(alignment.pairs).toEqual([]);
		expect(alignment.missed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.shift).toBeNull();
	});

	it('lists every attack as extra when nothing is expected', () => {
		const alignment = alignAttacks([], [0.1, 0.5]);
		expect(alignment.pairs).toEqual([]);
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([0, 1]);
	});

	it('reads attacks given out of order by time, keeping their indexes', () => {
		const attacks = played(eighths).reverse();
		const alignment = alignAttacks(eighths, attacks);
		expect(alignment.pairs.map((p) => [p.expectation, p.attack])).toEqual(
			[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, 7 - i])
		);
	});

	it('gives an attack exactly between two expectations to the later one', () => {
		const two: TimedExpectation[] = [
			{ index: 0, time: 0, zoneS: 0.05, windowS: 0.02, bar: 0 },
			{ index: 1, time: 0.1, zoneS: 0.05, windowS: 0.02, bar: 0 }
		];
		const alignment = alignAttacks(two, [0.05]);
		expect(alignment.pairs).toEqual([
			{ expectation: 1, attack: 0, offsetMs: expect.closeTo(-50), verdict: 'early' }
		]);
		expect(alignment.missed).toEqual([0]);
	});

	it('keeps each attack for the nearest expectation in tight sixteenths', () => {
		const plan = cycle('1111111111111111', 1, { ms: 80 }, of(1, 16));
		const timed = timeExpectations(plan, quarterAt(160), Fraction.ZERO);
		// Alternately 30 ms ahead and 30 ms behind, inside the 46.875 ms zones.
		const attacks = played(timed, (e) => (e.index % 2 === 0 ? -0.03 : 0.03));
		const alignment = alignAttacks(timed, attacks);
		expect(alignment.pairs.map((p) => p.attack)).toEqual(timed.map((e) => e.index));
		expect(alignment.pairs.every((p) => p.verdict === 'on-time')).toBe(true);
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([]);
	});
});

describe('alignAttacks: a lost or added beat', () => {
	// 1 1 1 0 0 1 0 0 over four bars: a beat later, only one note of a bar still falls on the figure.
	const plan = cycle('11100100', 4, { ms: 20 });
	const timed = timeExpectations(plan, map100, Fraction.ZERO);
	const context = alignContext(plan, map100, Fraction.ZERO);
	const fromBar2 = (by: number) => played(timed, (e) => (e.bar >= 2 ? by : 0));

	it('reports a beat lost from bar 2 as a shift, with no misses after it', () => {
		const attacks = fromBar2(0.6).filter((t) => t < context.endS);
		const alignment = alignAttacks(timed, attacks, context);
		expect(alignment.shift).toEqual({ bar: 2, byS: expect.closeTo(0.6) });
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.pairs).toHaveLength(16);
		expect(alignment.pairs.every((p) => p.verdict === 'on-time')).toBe(true);
	});

	it('reports a beat rushed from bar 2 as a negative shift', () => {
		const alignment = alignAttacks(timed, fromBar2(-0.6), context);
		expect(alignment.shift).toEqual({ bar: 2, byS: expect.closeTo(-0.6) });
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.pairs).toHaveLength(16);
	});

	it('does not call missed the notes of a beat the player skipped to come in early', () => {
		// 1 1 1 0 0 1 0 1: the player drops the last beat of bar 1 and plays on a beat early.
		const skip = cycle('11100101', 4, { ms: 20 });
		const skipTimed = timeExpectations(skip, map100, Fraction.ZERO);
		const lastBeatOfBar1 = 2.4 + 3 * 0.6;
		const attacks = played(skipTimed, (e) => (e.bar >= 2 ? -0.6 : 0)).filter(
			(t, i) => !(skipTimed[i].bar === 1 && t >= lastBeatOfBar1 - 1e-9)
		);
		const alignment = alignAttacks(skipTimed, attacks, alignContext(skip, map100, Fraction.ZERO));
		expect(alignment.shift).toEqual({ bar: 2, byS: expect.closeTo(-0.6) });
		expect(alignment.missed).toEqual([]);
		expect(alignment.extra).toEqual([]);
		expect(alignment.pairs).toHaveLength(skipTimed.length - 1);
	});

	it('drops the expectations a shift pushes past the round end without calling them missed', () => {
		// The figure ends on the last eighth of the bar: a beat later, the last note of the cycle
		// falls after the round, where the player cannot be heard in it.
		const late = cycle('11100101', 4, { ms: 20 });
		const lateTimed = timeExpectations(late, map100, Fraction.ZERO);
		const lateContext = alignContext(late, map100, Fraction.ZERO);
		const attacks = played(lateTimed, (e) => (e.bar >= 2 ? 0.6 : 0)).filter(
			(t) => t < lateContext.endS
		);
		const alignment = alignAttacks(lateTimed, attacks, lateContext);
		expect(alignment.shift).toEqual({ bar: 2, byS: expect.closeTo(0.6) });
		expect(alignment.missed).toEqual([]);
		// The last note of the cycle would fall after the round: neither paired nor missed.
		expect(alignment.pairs).toHaveLength(lateTimed.length - 1);
	});

	it('sees scattered misses as misses, not as a shift', () => {
		const eighths = timeExpectations(cycle('11111111', 4, { ms: 20 }), map100, Fraction.ZERO);
		const eighthsContext = alignContext(cycle('11111111', 4, { ms: 20 }), map100, Fraction.ZERO);
		const attacks = played(eighths).filter((_, i) => ![3, 12, 25].includes(i));
		const alignment = alignAttacks(eighths, attacks, eighthsContext);
		expect(alignment.shift).toBeNull();
		expect(alignment.missed).toEqual([3, 12, 25]);
	});

	it('finds a shift by the smallest subdivision', () => {
		const attacks = played(timed, (e) => (e.bar >= 1 ? 0.3 : 0)).filter((t) => t < context.endS);
		const alignment = alignAttacks(timed, attacks, context);
		expect(alignment.shift).toEqual({ bar: 1, byS: expect.closeTo(0.3) });
		expect(alignment.missed).toEqual([]);
	});

	it('looks for a shift by the smallest gap when given no context', () => {
		const attacks = played(timed, (e) => (e.bar >= 1 ? 0.3 : 0)).filter((t) => t < context.endS);
		const alignment = alignAttacks(timed, attacks);
		expect(alignment.shift).toEqual({ bar: 1, byS: expect.closeTo(0.3) });
	});
});
