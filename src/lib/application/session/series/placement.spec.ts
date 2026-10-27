import { describe, expect, it } from 'vitest';
import { exerciseById, IDENTIFY_NECK, LOCATE_NECK } from '$lib/domain/exercise';
import { DEFAULT_PREVIEW_BEATS } from '$lib/domain/exercise/pacing';
import { compileRound } from '$lib/domain/exercise/round';
import { Fraction, METER_4_4, type Meter } from '$lib/domain/time';
import type { LeadBeats, PlannedItem } from '$lib/domain/types';
import { change as gridChange } from '$lib/testing/gestureSeries';
import type { Scene } from '$lib/domain/exercise/types';
import {
	chainable,
	inFreeTime,
	nextBeat,
	placeNext,
	timedStart,
	type PlacementContext
} from './placement';

const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
const resolved = { previewBeats: DEFAULT_PREVIEW_BEATS };

const locate = (leadBeats: LeadBeats, meter: Meter) =>
	compileRound(
		LOCATE_NECK,
		{
			exerciseId: LOCATE_NECK.id,
			mechanic: 'locate',
			exerciseLevel: 0,
			item: { string: 3, pitch: 'C' },
			phase: 'learning',
			temperature: 'hot',
			aid: 'none',
			leadBeats
		},
		meter,
		resolved
	);
const change = (meter: Meter) =>
	compileRound(exerciseById('gesture-jam'), gridChange(0), meter, resolved);
const free = compileRound(
	IDENTIFY_NECK,
	{
		exerciseId: IDENTIFY_NECK.id,
		mechanic: 'identify',
		exerciseLevel: 0,
		item: { string: 3, fret: 5 },
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	} satisfies PlannedItem,
	METER_4_4,
	resolved
);

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

	describe('placeNext', () => {
		const SCENE: Scene = 'guitar';
		const tempo80 = { tempo: 80, meter: METER_4_4, scene: SCENE };
		const earliest = Fraction.of(3);

		/** Round after round at 80 bpm in 4/4 on the guitar, nothing past, nothing asked. */
		const context = (over: Partial<PlacementContext> = {}): PlacementContext => ({
			earliest,
			handover: false,
			nowBar: Fraction.ZERO,
			current: tempo80,
			coming: { ...tempo80, countIn: false, restBars: 0 },
			plan: locate(4, METER_4_4),
			firstAudibleBar: 3,
			...over
		});

		it('chains at the handover when nothing changes', () => {
			const plan = change(METER_4_4);
			expect(placeNext(context({ handover: true, plan }))).toEqual({
				kind: 'chain',
				start: earliest
			});
		});

		it('places after the breath on the first start its plan allows', () => {
			const plan = locate(4, METER_4_4);
			const placement = placeNext(context({ plan }));
			expect(placement).toEqual({
				kind: 'after-breath',
				start: timedStart(earliest, plan, METER_4_4)
			});
		});

		it('never starts a round with its prompt already past', () => {
			const plan = locate(8, METER_4_4);
			// Bar 9 is where the clock is: the prompt of a round starting on bar 5 (bar 3) is long gone.
			const placement = placeNext(context({ plan, nowBar: Fraction.of(9) }));
			expect(placement.kind).toBe('after-breath');
			if (placement.kind === 'after-breath') {
				expect(placement.start.compare(Fraction.of(9)) >= 0).toBe(true);
				expect(promptBar(placement.start, plan, METER_4_4).compare(Fraction.of(9)) >= 0).toBe(true);
			}
		});

		it('opens on the next beat in free time', () => {
			const at = Fraction.of(13, 4);
			expect(placeNext(context({ earliest: at, plan: free }))).toEqual({
				kind: 'next-beat',
				start: nextBeat(at, METER_4_4)
			});
		});

		it('counts a bar at another tempo', () => {
			expect(
				placeNext(context({ coming: { ...tempo80, tempo: 85, countIn: false, restBars: 0 } }))
			).toEqual({ kind: 'count-in', fromBar: 3, tempo: 85, meter: null, restBars: 0 });
		});

		it('counts a bar in another meter', () => {
			expect(
				placeNext(
					context({ coming: { ...tempo80, meter: METER_3_4, countIn: false, restBars: 0 } })
				)
			).toEqual({ kind: 'count-in', fromBar: 3, tempo: 80, meter: METER_3_4, restBars: 0 });
		});

		it('counts a bar before another scene', () => {
			expect(
				placeNext(context({ coming: { ...tempo80, scene: 'screen', countIn: false, restBars: 0 } }))
			).toEqual({ kind: 'count-in', fromBar: 3, tempo: null, meter: null, restBars: 0 });
		});

		it('asks its rest bars before a counted bar', () => {
			// The earliest is past: the count goes to the first audible bar.
			expect(
				placeNext(
					context({
						earliest: Fraction.of(2),
						firstAudibleBar: 5,
						coming: { ...tempo80, countIn: true, restBars: 2 }
					})
				)
			).toEqual({ kind: 'count-in', fromBar: 5, tempo: null, meter: null, restBars: 2 });
		});

		it('ignores its rest bars when it has no counted bar', () => {
			// Another scene brings the count, but only an item that asks a count asks its rest.
			expect(
				placeNext(context({ coming: { ...tempo80, scene: 'screen', countIn: false, restBars: 2 } }))
			).toMatchObject({ kind: 'count-in', restBars: 0 });
		});

		it('never counts rest bars at a change of tempo or meter', () => {
			for (const coming of [
				{ ...tempo80, tempo: 85, countIn: true, restBars: 2 },
				{ ...tempo80, meter: METER_3_4, countIn: true, restBars: 2 }
			]) {
				expect(placeNext(context({ coming }))).toMatchObject({ kind: 'count-in', restBars: 0 });
			}
		});

		it('goes on without a gap only when no counted bar is asked', () => {
			expect(chainable(tempo80, { ...tempo80, countIn: true, restBars: 0 })).toBe(false);
			expect(chainable(tempo80, { ...tempo80, countIn: false, restBars: 0 })).toBe(true);
		});
	});
});
