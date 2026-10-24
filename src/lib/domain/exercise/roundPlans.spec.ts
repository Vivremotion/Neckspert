import { describe, expect, it } from 'vitest';
import { Fraction } from '../time/fraction';
import { METER_4_4 } from '../time/meter';
import { validateRoundPlan, type RoundPlan } from '../time/plan';
import {
	firstAnswerTimes,
	responseZones,
	validateFirstAnswer
} from '../time/modes/firstAnswerTimes';
import { roundTimes } from '../time/modes/times';
import {
	anchorPlan as fixtureAnchor,
	gridPlan as fixtureGrid,
	locatePlan as fixtureLocate,
	map
} from '../time/modes/testing/plans';
import { anchorPlan, beatPlan, freePlan, gridChangePlan } from './roundPlans';

const content = { kind: 'note', value: 'F' };
const meter = METER_4_4;
const noContent = (plan: RoundPlan): RoundPlan => ({
	...plan,
	expectations: plan.expectations.map((e) => ({ ...e, content: null }))
});

describe('round plans of the four relations', () => {
	it('writes each relation as a valid plan', () => {
		const plans: RoundPlan[] = [];
		for (const leadBeats of [2, 4, 8] as const) {
			plans.push(beatPlan({ content, leadBeats, meter, respirationBars: 1 }));
			plans.push(
				anchorPlan({ root: content, chord: content, leadBeats, meter, respirationBars: 1 })
			);
		}
		for (const lengthBeats of [2, 4]) plans.push(gridChangePlan({ content, lengthBeats, meter }));
		plans.push(freePlan({ content, recallThresholdMs: 3000 }));
		expect(plans.map(validateRoundPlan)).toEqual(plans.map(() => null));
		expect(plans.map(validateFirstAnswer)).toEqual(plans.map(() => null));
	});

	it('times a located note on the beat relation’s grid', () => {
		const plan = beatPlan({ content, leadBeats: 4, meter, respirationBars: 1 });
		const clock = { map, start: Fraction.of(2) };
		const t = firstAnswerTimes(plan, clock, false, roundTimes(plan, clock));
		expect(t.promptS).toBeCloseTo(3.1, 9);
		expect(responseZones(plan, clock, t)[0].captureEndS).toBeCloseTo(8.35, 9);
	});

	it('waits for the chord until the next prompt’s string shows', () => {
		const plan = anchorPlan({
			root: content,
			chord: content,
			leadBeats: 4,
			meter,
			respirationBars: 1
		});
		expect(plan.listenUntil?.toString()).toBe('7/4');
	});

	it('hands a grid change over at its length', () => {
		const plan = gridChangePlan({ content, lengthBeats: 4, meter });
		expect(plan.handover?.toString()).toBe('1');
	});

	it('writes the free plan without tempo', () => {
		const plan = freePlan({ content, recallThresholdMs: 3000 });
		expect(plan.expectations[0].at).toBeNull();
		expect(plan.expectations[0].window).toEqual({ ms: 3000 });
		expect(plan.policy.pairing).toMatchObject({ opens: { afterPromptMs: 0 } });
	});

	it('equals the hand-written plans of the mode specs', () => {
		expect(noContent(beatPlan({ content, leadBeats: 4, meter, respirationBars: 1 }))).toEqual(
			fixtureLocate()
		);
		expect(
			noContent(
				anchorPlan({ root: content, chord: content, leadBeats: 4, meter, respirationBars: 1 })
			)
		).toEqual(fixtureAnchor());
		expect(noContent(gridChangePlan({ content, lengthBeats: 4, meter }))).toEqual(fixtureGrid());
	});
});
