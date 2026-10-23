import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import type { Figure, FigureElement } from './figure';
import { METER_4_4 } from './meter';
import { compileCyclePlan, validateRoundPlan, type RoundPlan } from './plan';

const of = Fraction.of;
const note = (n: number, d: number, tieToNext?: boolean): FigureElement => ({
	kind: 'note',
	duration: of(n, d),
	...(tieToNext ? { tieToNext } : {}),
	content: null
});
const rest = (n: number, d: number): FigureElement => ({ kind: 'rest', duration: of(n, d) });

// c8 c8 r8 c8 r8 c8 r8 c8: five attacks in a bar.
const contretemps: Figure = {
	schema: 1,
	meter: METER_4_4,
	bars: 1,
	voices: [
		{
			id: 'main',
			elements: [
				note(1, 8),
				note(1, 8),
				rest(1, 8),
				note(1, 8),
				rest(1, 8),
				note(1, 8),
				rest(1, 8),
				note(1, 8)
			]
		}
	]
};
// Bar 1: one whole note. Bar 2: two half notes.
const twoBars: Figure = {
	schema: 1,
	meter: METER_4_4,
	bars: 2,
	voices: [{ id: 'main', elements: [note(1, 1), note(1, 2), note(1, 2)] }]
};
const window = { ms: 80 };

describe('compileCyclePlan', () => {
	it('writes the cycle policy by its modes', () => {
		const plan = compileCyclePlan({
			figure: contretemps,
			cycleBars: 4,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on']
		});
		expect(plan.policy).toEqual({
			unit: 'cycle',
			pairing: { mode: 'alignment' },
			verdict: 'cycle',
			correction: false
		});
	});

	it('lists one point target per note of the contretemps over four bars', () => {
		const plan = compileCyclePlan({
			figure: contretemps,
			cycleBars: 4,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on', 'on', 'on', 'on']
		});
		expect(plan.expectations).toHaveLength(20);
		expect(plan.expectations.every((e) => e.role === 'target' && e.span === 'point')).toBe(true);
		expect(plan.expectations.every((e) => e.sensor === 'attack' && e.content === null)).toBe(true);
		expect(plan.expectations.every((e) => e.window !== window && 'ms' in e.window)).toBe(true);
		expect(plan.expectations[0].window).toEqual(window);
		expect(plan.expectations[0].window).not.toBe(plan.expectations[1].window);
		expect(plan.handover?.equals(of(4))).toBe(true);
		expect(plan.policy.unit).toBe('cycle');
		expect(plan.prompt).toBeNull();
		expect(plan.length.equals(of(4))).toBe(true);
		expect(plan.expectations[0].at!.equals(Fraction.ZERO)).toBe(true);
		expect(plan.expectations[5].at!.equals(of(1))).toBe(true);
		expect(plan.expectations[5].bar).toBe(1);
		expect(plan.expectations[19].at!.equals(of(3).add(of(7, 8)))).toBe(true);
		expect(validateRoundPlan(plan)).toBeNull();
	});

	it('skips tied notes and counts the bar of each expectation', () => {
		const tied: Figure = {
			schema: 1,
			meter: METER_4_4,
			bars: 1,
			voices: [{ id: 'main', elements: [note(1, 2, true), note(1, 4), note(1, 4)] }]
		};
		const plan = compileCyclePlan({
			figure: tied,
			cycleBars: 2,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on']
		});
		// The tie joins the half note to the quarter: one attack at 0, then the last quarter.
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '3/4', '1', '7/4']);
		expect(plan.expectations.map((e) => e.bar)).toEqual([0, 0, 1, 1]);
	});

	it('starts a two-bar figure at its second bar', () => {
		const plan = compileCyclePlan({
			figure: twoBars,
			cycleBars: 2,
			startBar: 1,
			sensor: 'attack',
			window,
			accompanimentBars: ['on', 'on']
		});
		// Bar 2 (two half notes), then bar 1 (one whole note) again.
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '1/2', '1']);
		expect(plan.expectations.map((e) => e.bar)).toEqual([0, 0, 1]);
	});

	it('wraps a start bar past the figure length', () => {
		const plan = compileCyclePlan({
			figure: twoBars,
			cycleBars: 2,
			startBar: 3,
			sensor: 'attack',
			window,
			accompanimentBars: ['on']
		});
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '1/2', '1']);
	});

	it('rotates the accompaniment by the start bar to find the muted bars', () => {
		const input = { figure: contretemps, cycleBars: 4, sensor: 'attack', window };
		const accompanimentBars: ('on' | 'off')[] = ['on', 'on', 'on', 'off'];
		expect(compileCyclePlan({ ...input, startBar: 3, accompanimentBars }).mutedBars).toEqual([0]);
		expect(compileCyclePlan({ ...input, startBar: 0, accompanimentBars }).mutedBars).toEqual([3]);
		expect(compileCyclePlan({ ...input, startBar: 1, accompanimentBars }).mutedBars).toEqual([2]);
	});

	it('repeats a short accompaniment over the cycle', () => {
		const plan = compileCyclePlan({
			figure: contretemps,
			cycleBars: 4,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on', 'off']
		});
		expect(plan.mutedBars).toEqual([1, 3]);
	});

	it('refuses an invalid cycle', () => {
		const base = {
			figure: contretemps,
			cycleBars: 4,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on', 'on', 'on', 'on'] as ('on' | 'off')[]
		};
		expect(() => compileCyclePlan({ ...base, cycleBars: 0 })).toThrow(RangeError);
		expect(() => compileCyclePlan({ ...base, startBar: -1 })).toThrow(RangeError);
		expect(() => compileCyclePlan({ ...base, accompanimentBars: [] })).toThrow(RangeError);
	});

	it('refuses a cycle that is not a whole number of figure loops', () => {
		const base = {
			figure: twoBars,
			startBar: 0,
			sensor: 'attack',
			window,
			accompanimentBars: ['on'] as ('on' | 'off')[]
		};
		expect(() => compileCyclePlan({ ...base, cycleBars: 3 })).toThrow(RangeError);
		expect(compileCyclePlan({ ...base, cycleBars: 4 }).expectations).toHaveLength(6);
	});
});

describe('validateRoundPlan', () => {
	const valid = (): RoundPlan => ({
		prompt: null,
		expectations: [
			{
				at: of(0),
				span: 'point',
				role: 'target',
				sensor: 'attack',
				content: null,
				window,
				bar: 0
			},
			{
				at: of(1, 2),
				span: { until: of(1) },
				role: 'target',
				sensor: 'chord',
				content: null,
				window,
				bar: 0
			}
		],
		length: of(1),
		policy: {
			unit: 'response',
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 300 },
				lateMs: 400,
				lateCapture: null
			},
			verdict: 'response',
			correction: false
		},
		mutedBars: []
	});

	it('accepts a well formed plan', () => {
		expect(validateRoundPlan(valid())).toBeNull();
	});

	it('refuses an expectation outside the length', () => {
		const plan = valid();
		plan.expectations[1].at = of(1);
		plan.expectations[1].span = 'point';
		expect(validateRoundPlan(plan)).toContain('expectation 1');
		plan.expectations[1].at = of(-1, 8);
		expect(validateRoundPlan(plan)).toContain('expectation 1');
	});

	it('refuses expectations out of order', () => {
		const plan = valid();
		plan.expectations.reverse();
		expect(validateRoundPlan(plan)).toContain('order');
	});

	it('refuses a span that does not run forward or past the length', () => {
		const plan = valid();
		plan.expectations[1].span = { until: of(1, 2) };
		expect(validateRoundPlan(plan)).toContain('span');
		plan.expectations[1].span = { until: of(3, 2) };
		expect(validateRoundPlan(plan)).toContain('span');
	});

	it('refuses a prompt placed after the first expectation', () => {
		const plan = valid();
		plan.prompt = of(1, 4);
		expect(validateRoundPlan(plan)).toContain('prompt');
		plan.prompt = of(0);
		expect(validateRoundPlan(plan)).toBeNull();
		plan.prompt = of(-1, 2);
		expect(validateRoundPlan(plan)).toBeNull();
	});

	it('refuses a hand-over outside (0, length]', () => {
		const plan = valid();
		plan.handover = of(1);
		expect(validateRoundPlan(plan)).toBeNull();
		plan.handover = Fraction.ZERO;
		expect(validateRoundPlan(plan)).toContain('handover');
		plan.handover = of(9, 8);
		expect(validateRoundPlan(plan)).toContain('handover');
	});

	it('accepts a free-time plan whose expectations all have no position', () => {
		const plan = valid();
		plan.expectations = [{ ...plan.expectations[0], at: null }];
		expect(validateRoundPlan(plan)).toBeNull();
	});

	it('refuses a plan that mixes timed and free-time expectations', () => {
		const plan = valid();
		plan.expectations[1] = { ...plan.expectations[1], at: null };
		expect(validateRoundPlan(plan)).toContain('free-time');
	});

	it('refuses a first-answer free-time plan that opens before its expectation', () => {
		const plan = valid();
		plan.expectations = [{ ...plan.expectations[0], at: null }];
		plan.policy.pairing = {
			mode: 'first-answer',
			opens: { beforeMs: 200, maxBeats: 0.4 },
			lateMs: 400,
			lateCapture: null
		};
		expect(validateRoundPlan(plan)).toContain('afterPromptMs');
	});

	it('refuses listenUntil outside (0, length]', () => {
		const plan = valid();
		plan.listenUntil = Fraction.ZERO;
		expect(validateRoundPlan(plan)).toContain('listenUntil');
		plan.listenUntil = plan.length.add(of(1, 4));
		expect(validateRoundPlan(plan)).toContain('listenUntil');
		plan.listenUntil = plan.length;
		expect(validateRoundPlan(plan)).toBeNull();
	});

	it('refuses a content without kind', () => {
		const plan = valid();
		plan.expectations[0].content = { kind: '', value: 1 };
		expect(validateRoundPlan(plan)).toContain('kind');
	});

	it('refuses an empty length, a bad window or a bad muted bar', () => {
		const empty = valid();
		empty.length = Fraction.ZERO;
		expect(validateRoundPlan(empty)).toContain('length');
		const badMs = valid();
		badMs.expectations[0].window = { ms: -1 };
		expect(validateRoundPlan(badMs)).toContain('window');
		const badGap = valid();
		badGap.expectations[0].window = { ofGap: Fraction.ZERO };
		expect(validateRoundPlan(badGap)).toContain('window');
		const badMuted = valid();
		badMuted.mutedBars = [-1];
		expect(validateRoundPlan(badMuted)).toContain('muted');
	});
});
