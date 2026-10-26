import { STRING_PREVIEW_BEATS } from '$lib/domain/timing/grid';
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
import { DEFAULT_RESPONSE_WINDOWS } from './windows';

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
			plans.push(
				beatPlan({
					content,
					leadBeats,
					meter,
					respirationBars: 1,
					windows: DEFAULT_RESPONSE_WINDOWS,
					previewBeats: STRING_PREVIEW_BEATS
				})
			);
			plans.push(
				anchorPlan({
					root: content,
					chord: content,
					leadBeats,
					meter,
					respirationBars: 1,
					windows: DEFAULT_RESPONSE_WINDOWS,
					previewBeats: STRING_PREVIEW_BEATS
				})
			);
		}
		for (const lengthBeats of [2, 4])
			plans.push(
				gridChangePlan({ content, lengthBeats, meter, windows: DEFAULT_RESPONSE_WINDOWS })
			);
		plans.push(freePlan({ content, recallThresholdMs: 3000 }));
		expect(plans.map(validateRoundPlan)).toEqual(plans.map(() => null));
		expect(plans.map(validateFirstAnswer)).toEqual(plans.map(() => null));
	});

	it('times a located note on the beat relation’s grid', () => {
		const plan = beatPlan({
			content,
			leadBeats: 4,
			meter,
			respirationBars: 1,
			windows: DEFAULT_RESPONSE_WINDOWS,
			previewBeats: STRING_PREVIEW_BEATS
		});
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
			respirationBars: 1,
			windows: DEFAULT_RESPONSE_WINDOWS,
			previewBeats: STRING_PREVIEW_BEATS
		});
		expect(plan.listenUntil?.toString()).toBe('7/4');
	});

	it('hands a grid change over at its length', () => {
		const plan = gridChangePlan({
			content,
			lengthBeats: 4,
			meter,
			windows: DEFAULT_RESPONSE_WINDOWS
		});
		expect(plan.handover?.toString()).toBe('1');
	});

	it('writes the free plan without tempo', () => {
		const plan = freePlan({ content, recallThresholdMs: 3000 });
		expect(plan.expectations[0].at).toBeNull();
		expect(plan.expectations[0].window).toEqual({ ms: 3000 });
		expect(plan.policy.pairing).toMatchObject({ opens: { afterPromptMs: 0 } });
	});

	it('equals the hand-written plans of the mode specs', () => {
		expect(
			noContent(
				beatPlan({
					content,
					leadBeats: 4,
					meter,
					respirationBars: 1,
					windows: DEFAULT_RESPONSE_WINDOWS,
					previewBeats: STRING_PREVIEW_BEATS
				})
			)
		).toEqual(fixtureLocate());
		expect(
			noContent(
				anchorPlan({
					root: content,
					chord: content,
					leadBeats: 4,
					meter,
					respirationBars: 1,
					windows: DEFAULT_RESPONSE_WINDOWS,
					previewBeats: STRING_PREVIEW_BEATS
				})
			)
		).toEqual(fixtureAnchor());
		expect(
			noContent(
				gridChangePlan({ content, lengthBeats: 4, meter, windows: DEFAULT_RESPONSE_WINDOWS })
			)
		).toEqual(fixtureGrid());
	});

	it('builds a plan with the windows its exercise writes', () => {
		const windows = { ...DEFAULT_RESPONSE_WINDOWS, perfectMs: 120, lateCaptureMs: 1000 };
		const plan = beatPlan({
			content,
			leadBeats: 4,
			meter,
			respirationBars: 1,
			windows,
			previewBeats: STRING_PREVIEW_BEATS
		});
		expect(plan.expectations[0].window).toEqual({ ms: 120 });
		expect(plan.policy.pairing).toMatchObject({ lateCapture: { ms: 1000 } });
		const anchor = anchorPlan({
			root: content,
			chord: content,
			leadBeats: 4,
			meter,
			respirationBars: 1,
			windows: { ...windows, anchorChordFromBeats: 2 },
			previewBeats: STRING_PREVIEW_BEATS
		});
		expect(anchor.expectations[1].at?.toString()).toBe('1/2');
		const change = gridChangePlan({ content, lengthBeats: 4, meter, windows });
		expect(change.policy.pairing).toMatchObject({ opens: { beforeMs: 200 } });
		expect(change.expectations[0].window).toEqual({ ms: 120 });
	});

	it('ends listening the preview beats its exercise writes before the round ends', () => {
		const at = (previewBeats: number) => ({
			content,
			leadBeats: 4 as const,
			meter,
			respirationBars: 1,
			windows: DEFAULT_RESPONSE_WINDOWS,
			previewBeats
		});
		expect(beatPlan(at(2)).listenUntil?.toString()).toBe('1/2');
		expect(beatPlan(at(0)).listenUntil?.toString()).toBe('1');
		const anchor = anchorPlan({ ...at(3), root: content, chord: content });
		expect(anchor.listenUntil?.toString()).toBe('5/4');
	});

	it('builds today’s plans when the exercise writes none', () => {
		const windows = DEFAULT_RESPONSE_WINDOWS;
		const base = {
			content,
			leadBeats: 4,
			meter,
			respirationBars: 1,
			windows,
			previewBeats: STRING_PREVIEW_BEATS
		} as const;
		expect(noContent(beatPlan(base))).toEqual(fixtureLocate());
		expect(
			noContent(
				anchorPlan({ ...base, root: content, chord: content, previewBeats: STRING_PREVIEW_BEATS })
			)
		).toEqual(fixtureAnchor());
		expect(noContent(gridChangePlan({ content, lengthBeats: 4, meter, windows }))).toEqual(
			fixtureGrid()
		);
	});
});
