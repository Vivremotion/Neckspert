import { describe, expect, it } from 'vitest';
import { DEFAULT_PACING } from '$lib/domain/exercise';
import { createAnchorTiming, NO_CHORD } from './anchor';

// 80 bpm: prompt on beat 4 (3.1 s), lead 4, target on beat 8 (6.1 s); the chord window runs from
// beat 9 (6.85 s) to beat 12 (9.1 s).
const beatTime = (i: number) => 0.1 + i * 0.75;
const timing = createAnchorTiming(DEFAULT_PACING);
const open = () =>
	timing.open({
		planned: { leadBeats: 4 },
		promptBeat: 4,
		now: 0,
		beatTime,
		secondsPerBeat: 0.75
	});
const root = (time: number, correct = true) => ({
	time,
	correct,
	answer: { midi: correct ? 62 : 63 },
	confusion: correct ? null : { kind: 'semitone', delta: 1, part: 'root' },
	sensor: 'note'
});
const chord = (time: number, correct = true, final = true) => ({
	time,
	correct,
	answer: { decided: correct ? 'd' : 'x' },
	confusion: correct ? null : { kind: 'other-inversion', part: 'chord' },
	sensor: 'chord',
	final
});

describe('anchorTiming', () => {
	it('judges the root on the target beat and the chord in the rest of the bar', () => {
		const r = open();
		expect(r.targetBeatIndex).toBe(8);
		expect(r.observe(root(6.13))).toEqual({ kind: 'pending' });
		expect(r.after()).toBeNull();
		expect(r.observe(chord(beatTime(10)))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'perfect',
				correct: true,
				answer: { root: { midi: 62 }, chord: { decided: 'd' } },
				confusion: null,
				timingOffsetMs: 30,
				reactionMs: 3030,
				laneBeat: 8
			}
		});
		// The prompt stays through the target bar; the breathing bar follows it.
		expect(r.after()).toEqual({ advanceAt: 12, earliestPrompt: 16 });
	});

	it('gives the verdict in time of the root', () => {
		const r = open();
		r.observe(root(6.3));
		expect(r.observe(chord(beatTime(9) + 0.2))).toMatchObject({
			outcome: { verdict: 'late', correct: true, timingOffsetMs: 200 }
		});
	});

	it('misses a right root without a chord, once no late reading can come any more', () => {
		const r = open();
		r.observe(root(6.13));
		// Beat 15 is the string preview of the next prompt: a chord attacked in the bar has had its say.
		for (const index of [9, 10, 11, 12, 13, 14]) {
			expect(r.onBeat({ index, time: beatTime(index) })).toEqual({ kind: 'none' });
		}
		expect(r.onBeat({ index: 15, time: beatTime(15) })).toMatchObject({
			kind: 'settled',
			outcome: {
				verdict: 'wrong',
				correct: false,
				answer: { root: { midi: 62 }, chord: null },
				confusion: NO_CHORD
			}
		});
	});

	it('does not take a chord played on the first beat', () => {
		const r = open();
		r.observe(root(6.1));
		expect(r.observe(chord(6.1))).toEqual({ kind: 'ignored', reason: 'before-window' });
		expect(r.observe(chord(beatTime(12) + 0.01))).toEqual({
			kind: 'ignored',
			reason: 'after-capture'
		});
		expect(r.onBeat({ index: 15, time: beatTime(15) })).toMatchObject({
			outcome: { verdict: 'wrong', confusion: NO_CHORD }
		});
	});

	it('waits past the end of the bar for the reading of a chord attacked late in it', () => {
		const r = open();
		r.observe(root(6.13));
		expect(r.onBeat({ index: 12, time: beatTime(12) })).toEqual({ kind: 'none' });
		// Attacked 250 ms before the bar ends; its first reading comes after the bar-end beat.
		expect(r.observe(chord(8.85))).toMatchObject({
			kind: 'settled',
			outcome: { verdict: 'perfect', correct: true }
		});
	});

	it('takes the final reading of the chord attack even after the end of the bar', () => {
		const r = open();
		r.observe(root(6.13));
		expect(r.observe(chord(beatTime(11), false, false))).toEqual({ kind: 'pending' });
		expect(r.onBeat({ index: 12, time: beatTime(12) })).toEqual({ kind: 'none' });
		expect(r.observe(chord(beatTime(11), true, true))).toMatchObject({
			outcome: { verdict: 'perfect', correct: true }
		});
	});

	it('misses a wrong root under a right chord, with the confusion of the root', () => {
		const r = open();
		expect(r.observe(root(6.13, false))).toEqual({ kind: 'pending' });
		expect(r.observe(chord(beatTime(10)))).toMatchObject({
			kind: 'settled',
			outcome: {
				verdict: 'wrong',
				correct: false,
				confusion: { kind: 'semitone', delta: 1, part: 'root' }
			}
		});
	});

	it('names the chord played instead when the root was right', () => {
		const r = open();
		r.observe(root(6.13));
		expect(r.observe(chord(beatTime(10), false))).toMatchObject({
			outcome: { verdict: 'wrong', confusion: { kind: 'other-inversion', part: 'chord' } }
		});
	});

	it('takes the first chord attack, refined until final, judged as it is when the wait ends', () => {
		const r = open();
		r.observe(root(6.13));
		expect(r.observe(chord(beatTime(10), false, false))).toEqual({ kind: 'pending' });
		expect(r.observe(chord(beatTime(11), true, true))).toEqual({
			kind: 'ignored',
			reason: 'settled'
		});
		expect(r.onBeat({ index: 12, time: beatTime(12) })).toEqual({ kind: 'none' });
		expect(r.onBeat({ index: 15, time: beatTime(15) })).toMatchObject({
			outcome: { verdict: 'wrong', answer: { chord: { decided: 'x' } } }
		});
	});

	it('shows a missed root at once, and keeps an off-beat root found before beat 2', () => {
		const r = open();
		expect(r.onBeat({ index: 9, time: beatTime(9) })).toMatchObject({
			kind: 'provisional',
			outcome: { verdict: 'wrong' }
		});
		expect(r.observe(root(6.7))).toEqual({ kind: 'pending' });
		expect(r.observe(chord(beatTime(10)))).toMatchObject({
			outcome: { verdict: 'offbeat', correct: true }
		});
	});

	it('never takes the strum of the chord, from beat 2 on, for a late root', () => {
		const r = open();
		r.onBeat({ index: 9, time: beatTime(9) });
		expect(r.observe(root(beatTime(10)))).toEqual({ kind: 'ignored', reason: 'after-capture' });
	});

	it('settles what it holds when abandoned, nothing before any answer', () => {
		expect(open().abandon()).toBeNull();
		const r = open();
		r.observe(root(6.13));
		expect(r.abandon()).toMatchObject({ verdict: 'wrong', confusion: NO_CHORD });
	});

	it('learns and adjusts its lead like the beat', () => {
		expect(timing.id).toBe('anchor');
		expect(timing.usesTempo).toBe(true);
		expect(timing.initialLead).toBe(8);
		expect(timing.adjustLead(8, true)).toBe(4);
		expect(timing.promptBeat(5, { leadBeats: 4 })).toBe(8);
		const base = { correct: true, reactionMs: 1, leadBeats: 2 as const, tempoBpm: 80 };
		expect(timing.isDirectRecall({ ...base, verdict: 'perfect' })).toBe(true);
		expect(timing.isDirectRecall({ ...base, verdict: 'offbeat' })).toBe(false);
	});
});
