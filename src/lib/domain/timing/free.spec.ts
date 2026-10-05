import { describe, expect, it } from 'vitest';
import { identifyTiming } from './free';

const beatTime = (i: number) => 0.1 + i * 0.75;
const round = () =>
	identifyTiming.open({
		planned: { leadBeats: null },
		promptBeat: 5,
		now: 10,
		beatTime,
		secondsPerBeat: 0.75
	});
const tap = (time: number, correct = true) => ({ time, correct, answer: 'C' });

describe('identifyTiming', () => {
	it('prompts as soon as asked, with no target', () => {
		expect(identifyTiming.promptBeat(5, { leadBeats: null })).toBe(5);
		expect(round()).toMatchObject({ promptBeatIndex: 5, promptTime: 10, targetBeatIndex: null });
		expect(identifyTiming).toMatchObject({ id: 'free', usesTempo: false, previewBeats: 0 });
	});

	it('judges a right answer by its reaction time and advances on the next beat', () => {
		const r = round();
		expect(r.observe(tap(11.2))).toEqual({
			kind: 'settled',
			outcome: {
				verdict: 'perfect',
				correct: true,
				answer: 'C',
				timingOffsetMs: null,
				reactionMs: 1200,
				laneBeat: null
			}
		});
		expect(r.after()).toEqual({ advanceAt: 15, earliestPrompt: 15 });
		expect(r.observe(tap(12))).toEqual({ kind: 'ignored', reason: 'settled' });
	});

	it('calls a slow right answer late and a wrong one wrong', () => {
		expect(round().observe(tap(14))).toMatchObject({
			outcome: { verdict: 'late', reactionMs: 4000 }
		});
		expect(round().observe(tap(11, false))).toMatchObject({ outcome: { verdict: 'wrong' } });
	});

	it('ignores a tap before the prompt', () => {
		const r = round();
		expect(r.observe(tap(9.9))).toEqual({ kind: 'ignored', reason: 'before-window' });
		expect(r.after()).toBeNull();
	});

	it('has no beat events and nothing to abandon', () => {
		const r = round();
		expect(r.onBeat({ index: 6, time: 5 })).toEqual({ kind: 'none' });
		expect(r.abandon()).toBeNull();
	});

	it('calls direct recall up to the threshold and keeps the lead at the shortest', () => {
		const base = { correct: true, verdict: 'perfect' as const, leadBeats: null, tempoBpm: null };
		expect(identifyTiming.isDirectRecall({ ...base, reactionMs: 3000 })).toBe(true);
		expect(identifyTiming.isDirectRecall({ ...base, reactionMs: 3001 })).toBe(false);
		expect(identifyTiming.learnedLead(80)).toBe(2);
		expect(identifyTiming.adjustLead(8, false)).toBe(2);
	});
});
