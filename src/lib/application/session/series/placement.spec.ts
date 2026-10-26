import { DEFAULT_RESPONSE_WINDOWS } from '$lib/domain/exercise/windows';
import { describe, expect, it } from 'vitest';
import { beatPlan, freePlan, gridChangePlan } from '$lib/domain/exercise/roundPlans';
import { NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import { Fraction, METER_4_4, type Meter } from '$lib/domain/time';
import type { LeadBeats } from '$lib/domain/types';
import { PROMPT_BEFORE_EARLIEST_BEATS, inFreeTime, nextBeat, timedStart } from './placement';

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
	it('lets a prompt come one beat before the earliest bar, no more', () => {
		expect(PROMPT_BEFORE_EARLIEST_BEATS).toBe(1);
	});

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

		it('takes the first whole bar whose prompt is at most a beat early when the earliest falls inside a bar', () => {
			const plan = locate(8, METER_4_4);
			// Earliest on beat 2 of bar 3: a prompt on bar 3's 1 is a beat early, which is allowed.
			const at = timedStart(Fraction.of(13, 4), plan, METER_4_4);
			expect(at.toString()).toBe('5');
			expect(promptBar(at, plan, METER_4_4).toString()).toBe('3');
			// Earliest on beat 3: bar 3's 1 is two beats early, the next 1 is taken.
			expect(timedStart(Fraction.of(7, 2), plan, METER_4_4).toString()).toBe('6');
		});
	});

	describe('timedStart in 3/4', () => {
		it.each([
			// A bar of 3 beats: lead 8 is 2 bars and 2 beats, lead 4 a bar and a beat.
			[8, '6', '10/3'],
			[4, '4', '8/3'],
			[2, '4', '10/3']
		] as const)('lead %i: its target on bar %s, its prompt on bar %s', (lead, start, prompt) => {
			const plan = locate(lead, METER_3_4);
			const at = timedStart(Fraction.of(3), plan, METER_3_4);
			expect(at.toString()).toBe(start);
			expect(promptBar(at, plan, METER_3_4).toString()).toBe(prompt);
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
