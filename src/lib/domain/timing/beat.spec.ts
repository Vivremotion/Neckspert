import { describe, expect, it } from 'vitest';
import { LEAD_STEPS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { DEFAULT_PACING } from '$lib/domain/exercise';
import { beatTiming as defaultBeatTiming, createBeatTiming } from './beat';

const beatTime = (i: number) => 0.1 + i * 0.75;
const note = (time: number, correct = true) => ({ time, correct, answer: 'a' });

describe.each([
	['beatTiming', defaultBeatTiming],
	['createBeatTiming(DEFAULT_PACING)', createBeatTiming(DEFAULT_PACING)]
])('%s', (_name, beatTiming) => {
	const round = (bt: (i: number) => number = beatTime, spb = 0.75) =>
		beatTiming.open({
			planned: { leadBeats: 4 },
			promptBeat: 4,
			now: 0,
			beatTime: bt,
			secondsPerBeat: spb
		});

	it('aligns the prompt so the target lands on a bar start', () => {
		expect(beatTiming.promptBeat(4, { leadBeats: 2 })).toBe(6);
		expect(beatTiming.promptBeat(4, { leadBeats: 4 })).toBe(4);
		expect(beatTiming.promptBeat(5, { leadBeats: 4 })).toBe(8);
	});

	it('falls back to a one-bar lead when the prompt has none', () => {
		expect(beatTiming.promptBeat(5, { leadBeats: null })).toBe(8);
		const r = beatTiming.open({
			planned: { leadBeats: null },
			promptBeat: 4,
			now: 0,
			beatTime,
			secondsPerBeat: 0.75
		});
		expect(r.targetBeatIndex).toBe(8);
	});

	it('opens a round with the prompt at its beat and the target a lead later', () => {
		expect(round()).toMatchObject({ promptBeatIndex: 4, targetBeatIndex: 8, promptTime: 3.1 });
	});

	it('settles the first note in the window and ignores the next', () => {
		const r = round();
		expect(r.observe(note(6.13))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'perfect',
				correct: true,
				answer: 'a',
				timingOffsetMs: 30,
				reactionMs: 3030,
				laneBeat: 8
			}
		});
		expect(r.observe(note(6.2))).toEqual({ kind: 'ignored', reason: 'settled' });
		expect(r.after()).toEqual({ advanceAt: 9, earliestPrompt: 12 });
	});

	it('judges early and late past PERFECT_WINDOW_MS', () => {
		const early = round().observe(note(6.0));
		const late = round().observe(note(6.2));
		expect(early).toMatchObject({ outcome: { verdict: 'early', timingOffsetMs: -100 } });
		expect(late).toMatchObject({ outcome: { verdict: 'late', timingOffsetMs: 100 } });
	});

	it('keeps exactly PERFECT_WINDOW_MS on either side perfect', () => {
		expect(round().observe(note(6.18))).toMatchObject({
			outcome: { verdict: 'perfect', timingOffsetMs: 80 }
		});
		expect(round().observe(note(6.02))).toMatchObject({
			outcome: { verdict: 'perfect', timingOffsetMs: -80 }
		});
	});

	it('judges one millisecond beyond the perfect window as late or early', () => {
		expect(round().observe(note(6.181))).toMatchObject({
			outcome: { correct: true, verdict: 'late', timingOffsetMs: 81, reactionMs: 3081 }
		});
		expect(round().observe(note(6.019))).toMatchObject({
			outcome: { correct: true, verdict: 'early', timingOffsetMs: -81, reactionMs: 2919 }
		});
	});

	it('decides the verdict on the rounded offset', () => {
		expect(round().observe(note(6.1804))).toMatchObject({
			outcome: { verdict: 'perfect', timingOffsetMs: 80 }
		});
		expect(round().observe(note(6.1806))).toMatchObject({
			outcome: { verdict: 'late', timingOffsetMs: 81 }
		});
	});

	it('judges a right note soon after the prompt as early', () => {
		expect(round().observe(note(3.455))).toMatchObject({
			outcome: { verdict: 'early', timingOffsetMs: -2645, reactionMs: 355 }
		});
	});

	it('takes the last instant of the window as late', () => {
		expect(round().observe(note(6.5))).toMatchObject({
			outcome: { verdict: 'late', timingOffsetMs: 400, reactionMs: 3400 }
		});
	});

	it('accepts a note that lands on the closing edge after latency correction', () => {
		const edge = (i: number) => 0.028 + (i - 4) * 0.25;
		expect(round(edge, 0.25).observe(note(1.453 - 25 / 1000))).toMatchObject({
			outcome: { verdict: 'late', timingOffsetMs: 400, reactionMs: 1400 }
		});
	});

	it('keeps a wrong note wrong, with its answer and its timing', () => {
		expect(round().observe(note(6.1, false))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'wrong',
				correct: false,
				answer: 'a',
				timingOffsetMs: 0,
				reactionMs: 3000,
				laneBeat: 8
			}
		});
	});

	it('keeps a wrong note wrong, with its offset', () => {
		expect(round().observe(note(6.13, false))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'wrong', correct: false, timingOffsetMs: 30 }
		});
	});

	it('ignores a note before the prompt or in its first 300 ms', () => {
		expect(round().observe(note(3.2))).toEqual({ kind: 'ignored', reason: 'before-window' });
		expect(round().observe(note(2))).toEqual({ kind: 'ignored', reason: 'before-window' });
	});

	it('opens the late capture when the window closes unanswered', () => {
		const r = round();
		expect(r.onBeat({ index: 8, time: 6.1 })).toEqual({ kind: 'none' });
		expect(r.onBeat({ index: 9, time: 6.85 })).toEqual({
			kind: 'provisional',
			outcome: {
				verdict: 'wrong',
				correct: false,
				answer: null,
				timingOffsetMs: null,
				reactionMs: null,
				laneBeat: 8
			}
		});
		expect(r.after()).toBeNull();
		expect(r.observe(note(7.0))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'offbeat', correct: true }
		});
		expect(r.after()).toEqual({ advanceAt: 10, earliestPrompt: 12 });
	});

	it('settles a right note past the window as off beat before the closing beat arrives', () => {
		const r = round();
		expect(r.observe(note(6.6))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'offbeat', correct: true, timingOffsetMs: 500 }
		});
		expect(r.after()).toEqual({ advanceAt: 9, earliestPrompt: 12 });
	});

	it('judges on time a note inside the window heard after the early closing beat', () => {
		const r = round();
		// onBeat runs up to 100 ms early: the closing beat is delivered before the note arrives.
		r.onBeat({ index: 9, time: 6.85 });
		expect(r.observe(note(6.45))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'late', correct: true, timingOffsetMs: 350 }
		});
		expect(r.after()).toEqual({ advanceAt: 10, earliestPrompt: 12 });
	});

	it('keeps a wrong note in the capture wrong', () => {
		const r = round();
		r.onBeat({ index: 9, time: 6.85 });
		expect(r.observe(note(7.0, false))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'wrong', answer: 'a' }
		});
	});

	it('ends the capture at the next prompt string preview', () => {
		const r = round();
		r.onBeat({ index: 9, time: 6.85 });
		expect(r.observe(note(8.4))).toEqual({ kind: 'ignored', reason: 'after-capture' });
		expect(r.onBeat({ index: 10, time: 7.6 })).toEqual({ kind: 'none' });
		expect(r.onBeat({ index: 11, time: 8.35 })).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'wrong', answer: null }
		});
		expect(r.after()).toEqual({ advanceAt: 10, earliestPrompt: 12 });
	});

	it('ends the capture before the next prompt at 160 bpm', () => {
		const fast = (i: number) => 0.1 + i * 0.375;
		const r = round(fast, 0.375);
		r.onBeat({ index: 9, time: fast(9) });
		// target 3.1 s + 2.4 s would be 5.5 s; beat 11 is 4.225 s
		expect(r.observe(note(fast(11) + 0.05))).toEqual({ kind: 'ignored', reason: 'after-capture' });
		expect(r.observe(note(fast(11) - 0.05))).toMatchObject({ outcome: { verdict: 'offbeat' } });
	});

	it('settles an open capture as unanswered on abandon, and nothing while listening', () => {
		const listening = round();
		expect(listening.abandon()).toBeNull();
		const capturing = round();
		capturing.onBeat({ index: 9, time: 6.85 });
		expect(capturing.abandon()).toMatchObject({ verdict: 'wrong', answer: null, laneBeat: 8 });
		expect(capturing.abandon()).toBeNull();
	});

	it('calls direct recall from the lead at the attempt tempo', () => {
		const base = {
			success: true,
			reactionMs: 1600,
			leadBeats: 2 as const,
			tempoBpm: 80
		};
		expect(beatTiming.isDirectRecall(base)).toBe(true);
		expect(beatTiming.isDirectRecall({ ...base, leadBeats: 4 })).toBe(false);
		// Off the beat is no success: found by calculation, never direct recall.
		expect(beatTiming.isDirectRecall({ ...base, success: false })).toBe(false);
		expect(beatTiming.isDirectRecall({ ...base, tempoBpm: null })).toBe(false);
		expect(beatTiming.isDirectRecall({ ...base, leadBeats: 4, tempoBpm: 160 })).toBe(true);
	});

	it('calls direct recall on the lead duration, not the reaction time, and only when right', () => {
		const base = { success: true, tempoBpm: 80 };
		expect(beatTiming.isDirectRecall({ ...base, reactionMs: 1510, leadBeats: 2 })).toBe(true);
		expect(beatTiming.isDirectRecall({ ...base, reactionMs: 100, leadBeats: 4 })).toBe(false);
		expect(
			beatTiming.isDirectRecall({ ...base, success: false, reactionMs: 1510, leadBeats: 2 })
		).toBe(false);
	});

	it('learns at the longest step that still fits in RECALL_THRESHOLD_MS', () => {
		// 60 bpm: 2 beats = 2000 ms, too long, but 2 is the shortest step
		expect(beatTiming.learnedLead(60)).toBe(2);
		// 120 bpm: 2 beats = 1000 ms, 4 beats = 2000 ms
		expect(beatTiming.learnedLead(120)).toBe(2);
		for (const bpm of [80, 100, 140, 160]) {
			const beats = beatTiming.learnedLead(bpm);
			expect((beats * 60_000) / bpm).toBeLessThanOrEqual(RECALL_THRESHOLD_MS);
		}
	});

	it('steps the lead one step at a time, never below two beats', () => {
		expect(beatTiming.adjustLead(8, true)).toBe(4);
		expect(beatTiming.adjustLead(4, false)).toBe(8);
		expect(LEAD_STEPS).toEqual([8, 4, 2]);
	});

	it('climbs the lead ladder', () => {
		expect(beatTiming.initialLead).toBe(8);
		expect(beatTiming.learnedLead(80)).toBe(2);
		expect(beatTiming.learnedLead(160)).toBe(4);
		expect(beatTiming.adjustLead(4, true)).toBe(2);
		expect(beatTiming.adjustLead(2, true)).toBe(2);
		expect(beatTiming.adjustLead(2, false)).toBe(4);
		expect(beatTiming.adjustLead(8, false)).toBe(8);
	});
});

describe('createBeatTiming', () => {
	const timing = createBeatTiming({ leadSteps: [8, 4], respirationBars: 2, learnedAfter: 2 });

	it('climbs only the steps of its pacing', () => {
		expect(timing.initialLead).toBe(8);
		expect(timing.adjustLead(8, true)).toBe(4);
		expect(timing.adjustLead(4, true)).toBe(4);
		expect(timing.adjustLead(4, false)).toBe(8);
		expect(timing.learnedLead(80)).toBe(4);
	});

	it('waits its breathing bars after the target before the next prompt', () => {
		const r = timing.open({
			planned: { leadBeats: 4 },
			promptBeat: 4,
			now: 0,
			beatTime,
			secondsPerBeat: 0.75
		});
		r.observe(note(6.13));
		expect(r.after()).toEqual({ advanceAt: 9, earliestPrompt: 16 });
	});

	it('ends the late capture at the string preview of a prompt two bars later', () => {
		const r = timing.open({
			planned: { leadBeats: 4 },
			promptBeat: 4,
			now: 0,
			beatTime,
			secondsPerBeat: 0.75
		});
		r.onBeat({ index: 9, time: 6.85 });
		// One bar of breathing would end the capture at beat 11 (8.35 s); two leave it the full 2.4 s.
		expect(r.observe(note(8.4))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'offbeat' }
		});
	});
});

describe('a reading that refines itself', () => {
	const open = () =>
		defaultBeatTiming.open({
			planned: { leadBeats: 4 },
			promptBeat: 4,
			now: 0,
			beatTime,
			secondsPerBeat: 0.75
		});
	const reading = (time: number, correct: boolean, answer: string, final: boolean) => ({
		time,
		correct,
		answer,
		confusion: correct ? null : { kind: answer },
		final
	});

	it('waits on a provisional wrong reading and settles on the final one of the same attack', () => {
		const r = open();
		expect(r.observe(reading(6.13, false, 'x', false))).toEqual({ kind: 'pending' });
		expect(r.after()).toBeNull();
		expect(r.observe(reading(6.13, true, 'd', true))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'perfect',
				correct: true,
				answer: 'd',
				confusion: null,
				timingOffsetMs: 30,
				reactionMs: 3030,
				laneBeat: 8
			}
		});
	});

	it('settles at once on a provisional reading that is right', () => {
		expect(open().observe(reading(6.13, true, 'd', false))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'perfect', answer: 'd' }
		});
	});

	it('keeps waiting past the window and judges the last reading when the capture ends', () => {
		const r = open();
		r.observe(reading(6.13, false, 'x', false));
		r.observe(reading(6.13, false, 'y', false));
		// The window closes on beat 9: no provisional miss while a reading waits.
		expect(r.onBeat({ index: 9, time: 6.85 })).toEqual({ kind: 'none' });
		expect(r.observe(reading(6.13, false, 'z', false))).toEqual({ kind: 'pending' });
		expect(r.onBeat({ index: 10, time: 7.6 })).toEqual({ kind: 'none' });
		expect(r.onBeat({ index: 11, time: 8.35 })).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'wrong',
				correct: false,
				answer: 'z',
				confusion: { kind: 'z' },
				timingOffsetMs: 30,
				reactionMs: 3030,
				laneBeat: 8
			}
		});
		expect(r.after()).toEqual({ advanceAt: 10, earliestPrompt: 12 });
	});

	it('ignores another attack while a reading waits', () => {
		const r = open();
		r.observe(reading(6.13, false, 'x', false));
		expect(r.observe(reading(6.4, true, 'd', true))).toEqual({
			kind: 'ignored',
			reason: 'settled'
		});
	});

	it('judges a waiting reading as it is when abandoned', () => {
		const r = open();
		r.observe(reading(6.13, false, 'x', false));
		expect(r.abandon()).toMatchObject({ verdict: 'wrong', answer: 'x', confusion: { kind: 'x' } });
		expect(r.abandon()).toBeNull();
	});

	it('keeps a provisional right reading off beat when it came after the window', () => {
		const r = open();
		r.onBeat({ index: 9, time: 6.85 });
		expect(r.observe(reading(7.0, false, 'x', false))).toEqual({ kind: 'pending' });
		expect(r.observe(reading(7.0, true, 'd', true))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'offbeat', correct: true }
		});
	});
});
