import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import type { Figure, FigureElement } from './figure';
import { METER_4_4 } from './meter';
import { figureExpectations, validateRoundPlan, type RoundPlan } from './plan';

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
	schema: 2,
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
	schema: 2,
	meter: METER_4_4,
	bars: 2,
	voices: [{ id: 'main', elements: [note(1, 1), note(1, 2), note(1, 2)] }]
};
const window = { ms: 80 };

describe('figureExpectations', () => {
	const base = { at: Fraction.ZERO, sensor: 'attack', window, content: () => null };

	it('lists one point target per note of the contretemps over four bars', () => {
		const expectations = figureExpectations({ ...base, figure: contretemps, bars: 4, startBar: 0 });
		expect(expectations).toHaveLength(20);
		expect(expectations.every((e) => e.role === 'target' && e.span === 'point')).toBe(true);
		expect(expectations.every((e) => e.sensor === 'attack' && e.content === null)).toBe(true);
		expect(expectations.every((e) => e.window !== window && 'ms' in e.window)).toBe(true);
		expect(expectations[0].window).toEqual(window);
		expect(expectations[0].window).not.toBe(expectations[1].window);
		expect(expectations[0].at!.equals(Fraction.ZERO)).toBe(true);
		expect(expectations[5].at!.equals(of(1))).toBe(true);
		expect(expectations[5].bar).toBe(1);
		expect(expectations[19].at!.equals(of(3).add(of(7, 8)))).toBe(true);
	});

	it('skips tied notes and counts the bar of each expectation', () => {
		const tied: Figure = {
			schema: 2,
			meter: METER_4_4,
			bars: 1,
			voices: [{ id: 'main', elements: [note(1, 2, true), note(1, 4), note(1, 4)] }]
		};
		const expectations = figureExpectations({ ...base, figure: tied, bars: 2, startBar: 0 });
		// The tie joins the half note to the quarter: one attack at 0, then the last quarter.
		expect(expectations.map((e) => e.at!.toString())).toEqual(['0', '3/4', '1', '7/4']);
		expect(expectations.map((e) => e.bar)).toEqual([0, 0, 1, 1]);
	});

	it('starts a two-bar figure at its second bar', () => {
		const expectations = figureExpectations({ ...base, figure: twoBars, bars: 2, startBar: 1 });
		// Bar 2 (two half notes), then bar 1 (one whole note) again.
		expect(expectations.map((e) => e.at!.toString())).toEqual(['0', '1/2', '1']);
		expect(expectations.map((e) => e.bar)).toEqual([0, 0, 1]);
	});

	it('wraps a start bar past the figure length', () => {
		const expectations = figureExpectations({ ...base, figure: twoBars, bars: 2, startBar: 3 });
		expect(expectations.map((e) => e.at!.toString())).toEqual(['0', '1/2', '1']);
	});

	it('starts the figure at its place in the round, counting the bars of the round', () => {
		const expectations = figureExpectations({
			...base,
			figure: twoBars,
			at: of(1),
			bars: 2,
			startBar: 0
		});
		expect(expectations.map((e) => e.at!.toString())).toEqual(['1', '2', '5/2']);
		expect(expectations.map((e) => e.bar)).toEqual([1, 2, 2]);
	});

	it('gives each played note, counted from the round start, the content it asks', () => {
		const pitched: Figure = {
			...twoBars,
			voices: [
				{
					id: 'main',
					elements: [
						{ kind: 'note', duration: of(1), content: null, pitch: 60 },
						{ kind: 'note', duration: of(1, 2), content: null, pitch: 62, string: 2 },
						{ kind: 'note', duration: of(1, 2), content: null, pitch: 64 }
					]
				}
			]
		};
		const seen: [number, number | undefined][] = [];
		const expectations = figureExpectations({
			...base,
			figure: pitched,
			bars: 4,
			startBar: 1,
			content: (k, played) => {
				seen.push([k, played.pitch]);
				return { kind: 'pitch', value: k };
			}
		});
		expect(seen).toEqual([
			[0, 62],
			[1, 64],
			[2, 60],
			[3, 62],
			[4, 64],
			[5, 60]
		]);
		expect(expectations.map((e) => e.content)).toEqual(
			[0, 1, 2, 3, 4, 5].map((value) => ({ kind: 'pitch', value }))
		);
	});

	it('refuses an invalid loop', () => {
		const loop = { ...base, figure: contretemps, bars: 4, startBar: 0 };
		expect(() => figureExpectations({ ...loop, bars: 0 })).toThrow(RangeError);
		expect(() => figureExpectations({ ...loop, startBar: -1 })).toThrow(RangeError);
		const broken: Figure = { ...contretemps, voices: [] };
		expect(() => figureExpectations({ ...loop, figure: broken })).toThrow(RangeError);
	});

	it('refuses bars that are not a whole number of figure loops', () => {
		const loop = { ...base, figure: twoBars, startBar: 0 };
		expect(() => figureExpectations({ ...loop, bars: 3 })).toThrow(RangeError);
		expect(figureExpectations({ ...loop, bars: 4 })).toHaveLength(6);
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

	it('accepts a plan that says where its count ends and where its target falls in its bar', () => {
		const plan: RoundPlan = { ...valid(), countEndsOn: 'target', barOffset: of(1, 2) };
		expect(validateRoundPlan(plan)).toBeNull();
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
