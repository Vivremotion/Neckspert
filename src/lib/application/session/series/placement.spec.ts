import { DEFAULT_RESPONSE_WINDOWS } from '$lib/domain/exercise/windows';
import { describe, expect, it } from 'vitest';
import { beatPlan, freePlan, gridChangePlan } from '$lib/domain/exercise/roundPlans';
import { NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import { Fraction, METER_4_4, type Meter } from '$lib/domain/time';
import type { LeadBeats } from '$lib/domain/types';
import { inFreeTime, nextBeat, timedStart } from './placement';

const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
const NOTE = { kind: NOTE_CONTENT, value: { string: 3, pitch: 'C' } };

const locate = (leadBeats: LeadBeats, meter: Meter) =>
	beatPlan({
		content: NOTE,
		leadBeats,
		meter,
		respirationBars: 1,
		windows: DEFAULT_RESPONSE_WINDOWS
	});
const change = (meter: Meter) =>
	gridChangePlan({ content: NOTE, lengthBeats: 4, meter, windows: DEFAULT_RESPONSE_WINDOWS });
const free = freePlan({
	content: { kind: NAME_CONTENT, value: { string: 3, fret: 5 } },
	recallThresholdMs: 3000
});

/** The bar of the prompt of a round starting on bar `start`, in bars. */
const promptBar = (start: Fraction, plan: ReturnType<typeof locate>, meter: Meter) =>
	start.add((plan.prompt ?? Fraction.ZERO).div(meter.unit.mul(Fraction.of(meter.count))));

describe('placement', () => {
	describe('timedStart in 4/4', () => {
		it.each([
			// [lead, start from bar 3, prompt]
			[8, '5', '3'],
			[4, '4', '3'],
			[2, '4', '7/2']
		] as const)('lead %i: its target on bar %s, its prompt on bar %s', (lead, start, prompt) => {
			const plan = locate(lead, METER_4_4);
			const at = timedStart(Fraction.of(3), plan, METER_4_4);
			expect(at.toString()).toBe(start);
			expect(promptBar(at, plan, METER_4_4).toString()).toBe(prompt);
		});

		it('opens a change of a grid a beat before the earliest bar, its target on it', () => {
			const plan = change(METER_4_4);
			const at = timedStart(Fraction.of(3), plan, METER_4_4);
			expect(at.toString()).toBe('3');
			expect(promptBar(at, plan, METER_4_4).toString()).toBe('11/4');
		});

		it('takes the first bar whose prompt is not before the earliest when the earliest falls inside a bar', () => {
			const plan = locate(8, METER_4_4);
			// Earliest on beat 2 of bar 3: a prompt on bar 3's 1 would come before it.
			const at = timedStart(Fraction.of(13, 4), plan, METER_4_4);
			expect(at.toString()).toBe('6');
			expect(promptBar(at, plan, METER_4_4).toString()).toBe('4');
		});

		it('places a target on beat 3 when the plan says so', () => {
			const plan = { ...locate(4, METER_4_4), barOffset: Fraction.of(1, 2) };
			const at = timedStart(Fraction.of(3), plan, METER_4_4);
			// The prompt on beat 3 of bar 3, the target a bar later, on beat 3 of bar 4.
			expect(at.toString()).toBe('9/2');
			expect(promptBar(at, plan, METER_4_4).toString()).toBe('7/2');
		});

		it('ends a count on the target for a grid change', () => {
			const plan = change(METER_4_4);
			expect(plan.countEndsOn).toBe('target');
			// A plan whose count ends on its prompt waits a bar more for the same target.
			const onPrompt = { ...plan, countEndsOn: 'prompt' as const };
			expect(timedStart(Fraction.of(3), plan, METER_4_4).toString()).toBe('3');
			expect(timedStart(Fraction.of(3), onPrompt, METER_4_4).toString()).toBe('4');
			// Ending on the target, a lead plan's prompt may come before the earliest.
			const lead = { ...locate(8, METER_4_4), countEndsOn: 'target' as const };
			expect(timedStart(Fraction.of(3), lead, METER_4_4).toString()).toBe('3');
		});

		it('refuses a target placed outside its bar', () => {
			const plan = locate(4, METER_4_4);
			for (const barOffset of [Fraction.of(-1, 4), Fraction.of(1), Fraction.of(5, 4)]) {
				expect(() => timedStart(Fraction.of(3), { ...plan, barOffset }, METER_4_4)).toThrow(
					new RangeError('barOffset must lie within its bar')
				);
			}
			// In 3/4 a bar is 3/4: an offset of 3/4 is the next bar, 1/2 lies within.
			expect(() =>
				timedStart(Fraction.of(3), { ...plan, barOffset: Fraction.of(3, 4) }, METER_3_4)
			).toThrow(RangeError);
			expect(
				timedStart(Fraction.of(3), { ...plan, barOffset: Fraction.of(1, 2) }, METER_3_4).toString()
			).toBe('14/3');
		});
	});

	describe('timedStart in 3/4', () => {
		it.each([
			// A bar of 3 beats: lead 8 is 2 bars and 2 beats, lead 2 two beats.
			[8, '6', '10/3'],
			[2, '4', '10/3']
		] as const)('lead %i: its target on bar %s, its prompt on bar %s', (lead, start, prompt) => {
			const plan = locate(lead, METER_3_4);
			const at = timedStart(Fraction.of(3), plan, METER_3_4);
			expect(at.toString()).toBe(start);
			expect(promptBar(at, plan, METER_3_4).toString()).toBe(prompt);
		});

		it('keeps a whole breath at lead 4 in 3/4', () => {
			// Lead 4 is a bar and a beat: its prompt never comes before the earliest bar.
			const plan = locate(4, METER_3_4);
			const at = timedStart(Fraction.of(3), plan, METER_3_4);
			expect(at.toString()).toBe('5');
			expect(promptBar(at, plan, METER_3_4).toString()).toBe('11/3');
		});

		it('opens a change of a grid a beat before the earliest bar', () => {
			const plan = change(METER_3_4);
			const at = timedStart(Fraction.of(3), plan, METER_3_4);
			expect(at.toString()).toBe('3');
			expect(promptBar(at, plan, METER_3_4).toString()).toBe('8/3');
		});
	});

	describe('nextBeat', () => {
		it('keeps a beat, and moves anything else to the next beat', () => {
			expect(nextBeat(Fraction.of(3), METER_4_4).toString()).toBe('3');
			expect(nextBeat(Fraction.of(13, 4), METER_4_4).toString()).toBe('13/4');
			expect(nextBeat(Fraction.of(3, 1).add(Fraction.of(1, 100)), METER_4_4).toString()).toBe(
				'13/4'
			);
			expect(nextBeat(Fraction.of(1, 2), METER_3_4).toString()).toBe('2/3');
		});
	});

	describe('inFreeTime', () => {
		it('holds for a plan whose expectations are all in free time', () => {
			expect(inFreeTime(free)).toBe(true);
			expect(inFreeTime(locate(4, METER_4_4))).toBe(false);
			expect(inFreeTime({ ...free, expectations: [] })).toBe(false);
		});
	});
});
