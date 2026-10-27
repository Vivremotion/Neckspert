import { describe, expect, it } from 'vitest';
import type { Judged, RoundPlan } from '../plan';
import { triadAnchorPlan, F, freeTimePlan, locatePlan, map, mapAt } from './testing/plans';
import { isDirectRecall, responseVerdict, type ResponseValue } from './responseVerdict';
import type { PairedAnswer, PairingResult, RoundClock, VerdictContext } from './types';
import { firstAnswerTimes } from './firstAnswerTimes';
import { roundTimes } from './times';

const RIGHT: Judged = { correct: true, answer: 'F', confusion: null };
const WRONG: Judged = { correct: false, answer: 'G', confusion: 'neighbour' };

const beatClock = (bpm = 80): RoundClock => ({ map: bpm === 80 ? map : mapAt(bpm), start: F(2) });

function context(plan: RoundPlan, clock: RoundClock = beatClock()): VerdictContext {
	return {
		plan,
		times: firstAnswerTimes(plan, clock, false, roundTimes(plan, clock)),
		clock,
		latency: null,
		thresholds: null,
		aids: ['show-position']
	};
}

function pair(
	expectation: number,
	time: number,
	judged: Judged | null = RIGHT,
	more: Partial<PairedAnswer> = {}
): PairedAnswer {
	return {
		expectation,
		time,
		judged,
		late: false,
		pending: false,
		correction: null,
		timing: null,
		offsetMs: null,
		...more
	};
}

function result(pairs: PairedAnswer[], missed: number[] = []): PairingResult {
	return {
		pairs,
		missed,
		dropped: [],
		extra: [],
		shift: null,
		clampedWindows: 0,
		attacks: pairs.map((p) => p.time)
	};
}

const valueOf = (outcome: { verdict: { value: unknown } }) =>
	outcome.verdict.value as ResponseValue;

describe('responseVerdict', () => {
	it('judges a located note in time, early, late and perfect within its window', () => {
		const plan = locatePlan();
		const at = (time: number) =>
			valueOf(responseVerdict.outcome(result([pair(0, time)]), context(plan)));

		expect(at(6.13)).toMatchObject({ verdict: 'perfect', timingOffsetMs: 30, reactionMs: 3030 });
		expect(at(6.0)).toMatchObject({ verdict: 'early', timingOffsetMs: -100 });
		expect(at(6.18)).toMatchObject({ verdict: 'perfect', timingOffsetMs: 80 });
		expect(at(6.25)).toMatchObject({ verdict: 'late', timingOffsetMs: 150 });
		expect(at(6.13).leadMs).toBe(3000);
	});

	it('records each expectation with its answer, and none for an expectation unanswered', () => {
		const outcome = responseVerdict.outcome(result([], [0]), context(locatePlan()));
		expect(outcome.success).toBe(false);
		expect(outcome.correct).toBe(false);
		expect(valueOf(outcome)).toEqual({
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null,
			leadMs: 3000,
			expectations: [
				{ index: 0, answer: null, correct: null, confusion: null, correction: null, late: false }
			]
		});

		const wrong = responseVerdict.outcome(result([pair(0, 6.1, WRONG)]), context(locatePlan()));
		expect(valueOf(wrong)).toMatchObject({
			verdict: 'wrong',
			timingOffsetMs: 0,
			expectations: [
				{ index: 0, answer: 'G', correct: false, confusion: 'neighbour', correction: null }
			]
		});
		expect(wrong.success).toBe(false);
	});

	it('keeps a right note off the beat a miss', () => {
		const outcome = responseVerdict.outcome(
			result([pair(0, 6.6, RIGHT, { late: true })]),
			context(locatePlan())
		);
		expect(valueOf(outcome).verdict).toBe('offbeat');
		expect(valueOf(outcome).expectations[0].late).toBe(true);
		expect(outcome.correct).toBe(true);
		expect(outcome.success).toBe(false);
	});

	it('takes the root’s verdict for a right anchor, corrected for a chord put right, wrong otherwise', () => {
		const plan = triadAnchorPlan();
		const judge = (pairs: PairedAnswer[], missed: number[] = []) =>
			responseVerdict.outcome(result(pairs, missed), context(plan));
		const putRight = { correction: { time: 7.2, judged: { ...RIGHT, answer: 'F major' } } };

		const right = judge([pair(0, 6.0), pair(1, 7.0)]);
		expect([valueOf(right).verdict, right.correct, right.success]).toEqual(['early', true, true]);

		const corrected = judge([pair(0, 6.13), pair(1, 7.0, WRONG, putRight)]);
		expect([valueOf(corrected).verdict, corrected.correct, corrected.success]).toEqual([
			'corrected',
			false,
			false
		]);
		expect(valueOf(corrected).expectations[1].correction).toBe('F major');

		const wrongRoot = judge([pair(0, 6.13, WRONG), pair(1, 7.0, WRONG, putRight)]);
		expect(valueOf(wrongRoot).verdict).toBe('wrong');

		const noChord = judge([pair(0, 6.13)], [1]);
		expect([valueOf(noChord).verdict, noChord.correct]).toEqual(['wrong', false]);
	});

	it('counts a reading still pending as it stands', () => {
		const outcome = responseVerdict.outcome(
			result([pair(0, 6.13), pair(1, 7.0, WRONG, { pending: true })]),
			context(triadAnchorPlan())
		);
		expect([valueOf(outcome).verdict, outcome.correct]).toEqual(['wrong', false]);
	});

	it('judges free time by reaction', () => {
		const base = freeTimePlan();
		const plan: RoundPlan = {
			...base,
			expectations: [{ ...base.expectations[0], window: { ms: 3000 } }]
		};
		const clock: RoundClock = { promptS: 1 };
		const at = (time: number) =>
			responseVerdict.outcome(result([pair(0, time)]), context(plan, clock));

		const quick = at(3.999);
		expect(valueOf(quick)).toMatchObject({
			verdict: 'perfect',
			reactionMs: 2999,
			timingOffsetMs: null,
			leadMs: null
		});
		expect(quick.success).toBe(true);
		const slow = at(4.001);
		expect(valueOf(slow)).toMatchObject({ verdict: 'late', reactionMs: 3001 });
		expect(slow.success).toBe(true);
	});

	it('needs a point expectation, timed by a window in ms', () => {
		expect(responseVerdict.validate?.(locatePlan())).toBeNull();
		expect(responseVerdict.validate?.(triadAnchorPlan())).toBeNull();
		const spans: RoundPlan = {
			...triadAnchorPlan(),
			expectations: triadAnchorPlan().expectations.slice(1)
		};
		expect(responseVerdict.validate?.(spans)).toBe('a response verdict needs a point expectation');
		const ofGap: RoundPlan = {
			...locatePlan(),
			expectations: locatePlan().expectations.map((e) => ({ ...e, window: { ofGap: F(1, 2) } }))
		};
		expect(responseVerdict.validate?.(ofGap)).toBe('a response verdict needs a window in ms');
	});

	it('wraps its value in a response envelope', () => {
		const outcome = responseVerdict.outcome(result([pair(0, 6.1)]), context(locatePlan()));
		expect(responseVerdict.id).toBe('response');
		expect(outcome.verdict.relation).toBe('response');
		expect(outcome.verdict.version).toBe(1);
		expect(outcome.measures).toEqual({});
		expect(outcome.aids).toEqual(['show-position']);
		expect(outcome.detail).toEqual(result([pair(0, 6.1)]));
	});

	it('reads direct recall from the lead, or the reaction in free time', () => {
		const plan = locatePlan();
		const lead = (bpm: number) => {
			const clock = beatClock(bpm);
			const start = 'map' in clock ? clock.map.toSeconds(clock.start) : 0;
			const outcome = responseVerdict.outcome(result([pair(0, start)]), context(plan, clock));
			return { value: valueOf(outcome), success: outcome.success };
		};
		// A bar of four beats at 160 bpm: 1 500 ms.
		const fast = lead(160);
		expect(fast.value.leadMs).toBe(1500);
		expect(isDirectRecall(fast.value, fast.success, 1500)).toBe(true);
		const slow = lead(80);
		expect(isDirectRecall(slow.value, slow.success, 1500)).toBe(false);
		expect(isDirectRecall(fast.value, false, 1500)).toBe(false);
		expect(isDirectRecall(fast.value, fast.success, null)).toBe(false);

		const free: ResponseValue = {
			verdict: 'perfect',
			timingOffsetMs: null,
			reactionMs: 2900,
			leadMs: null,
			expectations: []
		};
		expect(isDirectRecall(free, true, 3000)).toBe(true);
		expect(isDirectRecall({ ...free, reactionMs: 3100 }, true, 3000)).toBe(false);
		expect(isDirectRecall(free, true, null)).toBe(false);
	});
});
