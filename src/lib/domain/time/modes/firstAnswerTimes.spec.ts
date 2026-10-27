import { describe, expect, it } from 'vitest';
import type { Expectation, RoundPlan } from '../plan';
import { Fraction } from '../fraction';
import {
	triadAnchorPlan,
	expectation,
	F,
	freeTimePlan,
	gridPlan,
	locatePlan,
	map,
	mapAt,
	quarter
} from './testing/plans';
import { firstAnswerTimes, responseZones, validateFirstAnswer } from './firstAnswerTimes';
import { EDGE_TOLERANCE_S, roundTimes } from './times';
import type { RoundClock } from './types';

/** The instants a first-answer round is given, with the zones its pairing reads on them. */
function timesOf(plan: RoundPlan, clock: RoundClock, chained: boolean) {
	const times = firstAnswerTimes(plan, clock, chained, roundTimes(plan, clock));
	return { ...times, zones: responseZones(plan, clock, times) };
}

describe('firstAnswerTimes', () => {
	it('times a located note as the beat relation does', () => {
		const t = timesOf(locatePlan(), { map, start: F(2) }, false);
		expect(t.promptS).toBeCloseTo(3.1, 9);
		expect(t.zones).toHaveLength(1);
		expect(t.zones[0].opensS).toBeCloseTo(3.4, 9);
		expect(t.zones[0].inTimeEndS).toBeCloseTo(6.5, 9);
		expect(t.zones[0].captureEndS).toBeCloseTo(8.35, 9);
		expect(t.listenUntilS).toBeCloseTo(8.35, 9);
		expect(t.startS).toBeCloseTo(6.1, 9);
		expect(t.endS).toBeCloseTo(6.1 + 3, 9);
		expect(t.handoverS).toBeNull();
	});

	it('ends the root’s late capture where the chord’s span opens', () => {
		const t = timesOf(triadAnchorPlan(), { map, start: F(2) }, false);
		const [root, chord] = t.zones;
		expect(root.captureEndS).toBeCloseTo(6.85, 9);
		expect(chord.opensS).toBeCloseTo(6.85, 9);
		expect(chord.inTimeEndS).toBeCloseTo(9.1, 9);
		expect(chord.captureEndS).toBeCloseTo(9.1, 9);
		expect(chord.span).toBe('span');
		expect(t.listenUntilS).toBeCloseTo(11.35, 9);
	});

	it('ends a point’s zone where the next point’s window opens, not where its own opens after the prompt', () => {
		// Two notes a beat apart, both heard from 300 ms after the prompt (seed 4 of openness.spec).
		const plan: RoundPlan = {
			...locatePlan(),
			expectations: [
				expectation(Fraction.ZERO, 'point', 'note'),
				expectation(quarter, 'point', 'note')
			]
		};
		const t = timesOf(plan, { map, start: F(2) }, false);
		const [first, second] = t.zones;
		expect(first.opensS).toBeCloseTo(3.4, 9);
		expect(second.opensS).toBeCloseTo(3.4, 9);
		expect(first.inTimeEndS).toBeCloseTo(6.5, 9);
		// Its capture past the late limit ends where the second note's 80 ms window opens.
		expect(first.captureEndS).toBeCloseTo(6.77, 9);
		expect(second.captureEndS).toBeCloseTo(8.35, 9);
		// Without a late capture, a late limit past the next window is cut there too.
		const late: RoundPlan = {
			...plan,
			policy: {
				...plan.policy,
				pairing: { ...plan.policy.pairing, lateMs: 1000, lateCapture: null }
			}
		};
		expect(timesOf(late, { map, start: F(2) }, false).zones[0].captureEndS).toBeCloseTo(6.77, 9);
	});

	it('lets a point capture late as if alone when the next one is due at or before its place', () => {
		// Two notes on one beat (seed 30 of openness.spec), two a sixth of a beat apart, each
		// opened 200 ms early (seed 144), a note and a stretch from the same place (seed 1540): the
		// first is no longer cut before its own place; their zones overlap.
		const early = gridPlan().policy;
		const twice = (second: Expectation): RoundPlan => ({
			...locatePlan(),
			policy: { ...early, pairing: { ...early.pairing, lateMs: 0, lateCapture: 'to-end' } },
			expectations: [expectation(F(1, 12), 'point', 'note'), second]
		});
		const clock = { map, start: F(2) };
		for (const second of [
			expectation(F(1, 12), 'point', 'note'),
			expectation(F(1, 8), 'point', 'note'),
			expectation(F(1, 12), { until: F(1, 4) }, 'chord')
		]) {
			const t = timesOf(twice(second), clock, false);
			expect(t.zones[0].captureEndS).toBeCloseTo(t.listenUntilS, 9);
		}
	});

	it('opens a grid change early by its tolerance, capped in beats', () => {
		const m = mapAt(120);
		const startS = m.toSeconds(F(1));
		const t = timesOf(gridPlan(), { map: m, start: F(1) }, false);
		expect(t.zones[0].opensS).toBeCloseTo(startS - 0.2, 9);
		expect(t.zones[0].inTimeEndS).toBeCloseTo(startS + 0.4, 9);
		expect(t.handoverS).toBeCloseTo(startS + 2 - 0.2, 9);
		expect(t.listenUntilS).toBeCloseTo(startS + 2 - 0.2, 9);
		expect(t.zones[0].captureEndS).toBeCloseTo(startS + 2 - 0.2, 9);
		const slow = timesOf(gridPlan(), { map: mapAt(160), start: F(1) }, false);
		expect(slow.zones[0].opensS).toBeCloseTo(mapAt(160).toSeconds(F(1)) - 0.15, 9);
	});

	it('shows a chained grid change at its opening', () => {
		const chained = timesOf(gridPlan(), { map, start: F(1) }, true);
		expect(chained.promptS).toBeCloseTo(chained.zones[0].opensS, 9);
		const alone = timesOf(gridPlan(), { map, start: F(1) }, false);
		expect(alone.promptS).toBeCloseTo(map.toSeconds(F(1)) - 0.75, 9);
		expect(EDGE_TOLERANCE_S).toBe(1e-6);
	});

	it('opens a free-time expectation at the prompt and never closes it', () => {
		const t = timesOf(freeTimePlan(), { promptS: 10 }, false);
		expect(t.zones[0].opensS).toBeCloseTo(10.3, 9);
		expect(t.zones[0].inTimeEndS).toBe(Infinity);
		expect(t.zones[0].captureEndS).toBe(Infinity);
		expect(t.zones[0].atS).toBeNull();
		expect(t.listenUntilS).toBe(Infinity);
		expect(t.handoverS).toBeNull();
	});

	it('keeps the instants of a plan that opens after its prompt', () => {
		const plan = { ...gridPlan(), policy: locatePlan().policy };
		const clock = { map, start: F(1) };
		expect(firstAnswerTimes(plan, clock, true, roundTimes(plan, clock))).toEqual(
			roundTimes(plan, clock)
		);
	});
});

describe('roundTimes', () => {
	it('places the instants where the plan puts them, whatever its modes', () => {
		const plan: RoundPlan = {
			...locatePlan(),
			prompt: null,
			handover: F(1),
			listenUntil: undefined,
			policy: {
				...locatePlan().policy,
				unit: 'cycle',
				verdict: 'cycle',
				pairing: { mode: 'alignment' }
			}
		};
		const t = roundTimes(plan, { map, start: F(2) });
		expect(t.startS).toBeCloseTo(6.1, 9);
		expect(t.promptS).toBeCloseTo(6.1, 9);
		expect(t.endS).toBeCloseTo(9.1, 9);
		expect(t.handoverS).toBeCloseTo(9.1, 9);
		expect(t.listenUntilS).toBeCloseTo(9.1, 9);
	});

	it('does not shift a grid change’s handover: the first-answer mode does', () => {
		const t = roundTimes(gridPlan(), { map, start: F(1) });
		expect(t.handoverS).toBeCloseTo(map.toSeconds(F(2)), 9);
		expect(timesOf(gridPlan(), { map, start: F(1) }, false).handoverS).toBeLessThan(
			t.handoverS as number
		);
	});

	it('starts, ends and prompts a free-time round at its prompt, listening ever after', () => {
		expect(roundTimes(freeTimePlan(), { promptS: 10 })).toEqual({
			promptS: 10,
			startS: 10,
			endS: 10,
			listenUntilS: Infinity,
			handoverS: null
		});
	});
});

describe('validateFirstAnswer', () => {
	it('accepts the plans it is written for', () => {
		for (const plan of [locatePlan(), triadAnchorPlan(), gridPlan(), freeTimePlan()]) {
			expect(validateFirstAnswer(plan)).toBeNull();
		}
	});

	it('refuses a free-time plan that opens before its expectation', () => {
		const plan = freeTimePlan();
		plan.policy.pairing = {
			mode: 'first-answer',
			opens: { beforeMs: 200, maxBeats: 0.4 },
			lateMs: 400,
			lateCapture: null
		};
		expect(validateFirstAnswer(plan)).toContain('afterPromptMs');
	});

	it('refuses a stretch starting where the round has stopped listening, not a point placed there', () => {
		// The anchor stops listening at 7/4; its chord starts at 1/4.
		const anchor = triadAnchorPlan();
		expect(validateFirstAnswer({ ...anchor, listenUntil: F(1, 2) })).toBeNull();
		expect(validateFirstAnswer({ ...anchor, listenUntil: F(1, 4) })).toBe(
			'expectation 1 is a stretch starting at 1/4, where the round has stopped listening (1/4): it is never answered'
		);
		// A point there is still answered early, from its window's opening (seed 501 of openness.spec).
		const late: RoundPlan = {
			...locatePlan(),
			expectations: [expectation(F(1, 2), 'point', 'note')],
			listenUntil: F(1, 4)
		};
		expect(validateFirstAnswer(late)).toBeNull();
	});

	it('refuses settings it cannot read', () => {
		const plan = locatePlan();
		plan.policy.pairing = { mode: 'first-answer', opens: {}, lateMs: 400, lateCapture: null };
		expect(validateFirstAnswer(plan)).toContain('opens');
		plan.policy.pairing = {
			mode: 'first-answer',
			opens: { afterPromptMs: 300 },
			lateMs: -1,
			lateCapture: null
		};
		expect(validateFirstAnswer(plan)).toContain('lateMs');
		plan.policy.pairing = {
			mode: 'first-answer',
			opens: { afterPromptMs: 300 },
			lateMs: 400,
			lateCapture: 'soon'
		};
		expect(validateFirstAnswer(plan)).toContain('late');
	});
});
