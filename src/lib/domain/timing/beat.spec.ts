import { describe, expect, it } from 'vitest';
import { beatTiming } from './beat';

const beatTime = (i: number) => 0.1 + i * 0.75;
const round = (bt: (i: number) => number = beatTime, spb = 0.75) =>
	beatTiming.open({
		planned: { leadBeats: 4 },
		promptBeat: 4,
		now: 0,
		beatTime: bt,
		secondsPerBeat: spb
	});
const note = (time: number, correct = true) => ({ time, correct, answer: 'a' });

describe('beatTiming', () => {
	it('aligns the prompt so the target lands on a bar start', () => {
		expect(beatTiming.promptBeat(4, { leadBeats: 2 })).toBe(6);
		expect(beatTiming.promptBeat(4, { leadBeats: 4 })).toBe(4);
		expect(beatTiming.promptBeat(5, { leadBeats: 4 })).toBe(8);
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
			correct: true,
			verdict: 'perfect' as const,
			reactionMs: 1600,
			leadBeats: 2 as const,
			tempoBpm: 80
		};
		expect(beatTiming.isDirectRecall(base)).toBe(true);
		expect(beatTiming.isDirectRecall({ ...base, leadBeats: 4 })).toBe(false);
		expect(beatTiming.isDirectRecall({ ...base, verdict: 'offbeat' })).toBe(false);
		expect(beatTiming.isDirectRecall({ ...base, tempoBpm: null })).toBe(false);
		expect(beatTiming.isDirectRecall({ ...base, leadBeats: 4, tempoBpm: 160 })).toBe(true);
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
