import { describe, expect, it } from 'vitest';
import { LATE_LIMIT_MS } from '$lib/domain/scoring/timing';
import { createGridTiming, GRID_EARLY_MAX_BEATS, GRID_EARLY_MS } from './gridChange';

/** An item as the test mechanic writes it: the change's length in beats. */
const timing = createGridTiming((item) => ({ lengthBeats: (item as { length: number }).length }));

function beatTimeAt(bpm: number) {
	const spb = 60 / bpm;
	return { beatTime: (i: number) => 1 + i * spb, spb };
}

/** A change on beat 4 lasting 2 beats, opened on beat 3 after a wait on the grid. */
function round(bpm = 80, input: { promptBeat?: number; chained?: boolean; length?: number } = {}) {
	const { beatTime, spb } = beatTimeAt(bpm);
	const r = timing.open({
		planned: { leadBeats: null, item: { length: input.length ?? 2 } },
		promptBeat: input.promptBeat ?? 3,
		now: 0,
		beatTime,
		secondsPerBeat: spb,
		chained: input.chained ?? false
	});
	/** An attack `ms` after the change. */
	const at = (ms: number, correct = true, final?: boolean) => ({
		time: beatTime(r.targetBeatIndex ?? 0) + ms / 1000,
		correct,
		answer: correct ? 'right' : 'wrong',
		...(final !== undefined && { final })
	});
	return { r, at, beatTime };
}

describe('the early tolerance', () => {
	it('is GRID_EARLY_MS, never more than GRID_EARLY_MAX_BEATS of a beat', () => {
		expect(GRID_EARLY_MS).toBe(200);
		expect(GRID_EARLY_MAX_BEATS).toBe(0.4);
	});
});

describe('a chord change on the grid', () => {
	it('opens on beat 4 of a bar when it waited on the grid, its change on the 1 after', () => {
		expect(timing.promptBeat(5, { leadBeats: null })).toBe(7);
		expect(timing.promptBeat(7, { leadBeats: null })).toBe(7);
		const { r } = round(80, { promptBeat: 7 });
		expect(r.promptBeatIndex).toBe(7);
		expect(r.targetBeatIndex).toBe(8);
	});

	it('changes on the handover beat when chained, eighth or triplet alike', () => {
		expect(round(80, { promptBeat: 6.5, chained: true }).r.targetBeatIndex).toBe(6.5);
		expect(round(80, { promptBeat: 6 + 2 / 3, chained: true }).r.targetBeatIndex).toBeCloseTo(
			6.6667
		);
	});

	it('places a fractional change at its audio time, at 80 and 120 bpm', () => {
		for (const bpm of [80, 120]) {
			const { r, beatTime } = round(bpm, { promptBeat: 6.5, chained: true, length: 1.5 });
			expect(beatTime(r.targetBeatIndex ?? 0)).toBeCloseTo(1 + (6.5 * 60) / bpm);
			expect(r.handover?.beat).toBe(8);
		}
		const triplet = round(120, { promptBeat: 6 + 2 / 3, chained: true, length: 4 / 3 });
		expect(triplet.r.handover?.beat).toBeCloseTo(8);
	});

	it('hands over at the next change minus the early tolerance', () => {
		const slow = round(80);
		expect(slow.r.handover?.beat).toBe(6);
		expect(slow.r.handover?.time).toBeCloseTo(slow.beatTime(6) - 0.2);
		const fast = round(160);
		expect(fast.r.handover?.time).toBeCloseTo(fast.beatTime(6) - 0.15);
	});

	it('judges the first attack in the window by its offset to the change', () => {
		const verdictAt = (ms: number) => {
			const { r, at } = round();
			const event = r.observe(at(ms));
			return event.kind === 'settled' ? event.outcome.verdict : event.kind;
		};
		expect(verdictAt(-100)).toBe('early');
		expect(verdictAt(-60)).toBe('perfect');
		expect(verdictAt(300)).toBe('late');
		expect(verdictAt(600)).toBe('offbeat');
	});

	it('keeps the outcome of a right answer with its offset and the change on the lane', () => {
		const { r, at } = round();
		expect(r.observe(at(-100))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'early',
				correct: true,
				answer: 'right',
				timingOffsetMs: -100,
				reactionMs: 650,
				laneBeat: 4
			}
		});
		expect(r.observe(at(10))).toEqual({ kind: 'ignored', reason: 'settled' });
		expect(r.after()).toEqual({ advanceAt: Infinity, earliestPrompt: 6 });
	});

	it('calls a wrong chord wrong, in the window or after it', () => {
		const { r, at } = round();
		const event = r.observe(at(600, false));
		expect(event.kind === 'settled' && event.outcome).toMatchObject({
			verdict: 'wrong',
			correct: false,
			answer: 'wrong'
		});
	});

	it('leaves an attack before the window to the change before, and one after the handover to the next', () => {
		const before = round();
		expect(before.r.observe(before.at(-300))).toEqual({ kind: 'ignored', reason: 'before-window' });
		const after = round();
		expect(after.r.observe(after.at(1300))).toEqual({ kind: 'ignored', reason: 'after-capture' });
	});

	it('at 160 bpm, takes an attack 140 ms early and leaves one 160 ms early', () => {
		const taken = round(160);
		expect(taken.r.observe(taken.at(-140)).kind).toBe('settled');
		const left = round(160);
		expect(left.r.observe(left.at(-160))).toEqual({ kind: 'ignored', reason: 'before-window' });
	});

	it('shows a provisional miss when the window closes unanswered, settled wrong at the handover', () => {
		const { r, beatTime } = round();
		expect(r.onBeat({ index: 4, time: beatTime(4) })).toEqual({ kind: 'none' });
		const closed = r.onBeat({ index: 5, time: beatTime(5) });
		expect(closed.kind).toBe('provisional');
		// Never settled on a beat: the handover settles it.
		expect(r.onBeat({ index: 6, time: beatTime(6) })).toEqual({ kind: 'none' });
		expect(r.abandon(beatTime(6) - 0.2)).toMatchObject({
			verdict: 'wrong',
			correct: false,
			answer: null,
			laneBeat: 4
		});
		expect(r.abandon(beatTime(6))).toBeNull();
	});

	it('settles unanswered at a handover reached before any beat closed the window', () => {
		const { r, beatTime } = round(160, { length: 1 });
		expect(r.abandon(r.handover?.time)).toMatchObject({ verdict: 'wrong', answer: null });
		expect(beatTime(5)).toBeGreaterThan(r.handover?.time ?? Infinity);
	});

	it('drops a change paused before its window closed, unanswered', () => {
		const { r, beatTime } = round();
		expect(r.abandon(beatTime(4))).toBeNull();
		expect(r.after()).toBeNull();
	});

	it('waits for a better reading of the first attack, and takes it', () => {
		const { r, at } = round();
		expect(r.observe(at(-100, false, false))).toEqual({ kind: 'pending' });
		expect(r.observe(at(50, true))).toEqual({ kind: 'ignored', reason: 'settled' });
		const event = r.observe(at(-100, true, true));
		expect(event.kind === 'settled' && event.outcome.verdict).toBe('early');
	});

	it('settles a reading still waiting at the handover as it is', () => {
		const { r, at, beatTime } = round();
		r.observe(at(100, false, false));
		expect(r.abandon(beatTime(6) - 0.2)).toMatchObject({ verdict: 'wrong', answer: 'wrong' });
	});

	it('never decides direct recall, and has no lead nor preview', () => {
		expect(
			timing.isDirectRecall({
				correct: true,
				verdict: 'perfect',
				reactionMs: 1,
				leadBeats: null,
				tempoBpm: 80
			})
		).toBe(false);
		expect(timing.previewBeats).toBe(0);
		expect(timing.usesTempo).toBe(true);
		expect(LATE_LIMIT_MS).toBe(400);
	});
});
