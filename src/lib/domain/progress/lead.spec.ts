import { describe, expect, it } from 'vitest';
import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { adjustLeadBeats, isDirectRecall, leadForThreshold } from './lead';

describe('leadForThreshold', () => {
	it('picks the longest step that still fits in RECALL_THRESHOLD_MS', () => {
		// 80 bpm: 2 beats = 1500 ms, 4 beats = 3000 ms
		expect(leadForThreshold(80)).toBe(2);
		// 60 bpm: 1 beat = 1000 ms, 2 beats = 2000 ms
		expect(leadForThreshold(60)).toBe(1);
		// 120 bpm: 2 beats = 1000 ms, 4 beats = 2000 ms
		expect(leadForThreshold(120)).toBe(2);
		// 40 bpm: even 1 beat = 1500 ms
		expect(leadForThreshold(40)).toBe(1);
	});

	it('never returns a step longer than the threshold allows', () => {
		for (const bpm of [60, 80, 100, 140]) {
			const beats = leadForThreshold(bpm);
			expect((beats * 60_000) / bpm).toBeLessThanOrEqual(RECALL_THRESHOLD_MS);
		}
	});
});

describe('isDirectRecall', () => {
	const TEMPO = 80;

	it('mode 2: uses reactionMs against the threshold', () => {
		expect(isDirectRecall({ correct: true, reactionMs: 0, leadBeats: null }, TEMPO)).toBe(true);
		expect(
			isDirectRecall(
				{ correct: true, reactionMs: IDENTIFY_RECALL_THRESHOLD_MS, leadBeats: null },
				TEMPO
			)
		).toBe(true);
		expect(
			isDirectRecall(
				{ correct: true, reactionMs: IDENTIFY_RECALL_THRESHOLD_MS + 1, leadBeats: null },
				TEMPO
			)
		).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 400, leadBeats: null }, TEMPO)).toBe(false);
		expect(isDirectRecall({ correct: true, reactionMs: null, leadBeats: null }, TEMPO)).toBe(false);
	});

	it('mode 1: uses lead duration, not reactionMs', () => {
		// 2 beats at 80 bpm = 1500 ms → direct even if reaction is slow
		expect(isDirectRecall({ correct: true, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(true);
		// 4 beats at 80 bpm = 3000 ms → not direct even if reaction looks fast
		expect(isDirectRecall({ correct: true, reactionMs: 100, leadBeats: 4 }, TEMPO)).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(false);
	});
});

describe('adjustLeadBeats', () => {
	it('shortens one step on success and lengthens one on failure for locate', () => {
		expect(adjustLeadBeats(8, true, 'locate')).toBe(4);
		expect(adjustLeadBeats(4, true, 'locate')).toBe(2);
		expect(adjustLeadBeats(2, true, 'locate')).toBe(1);
		expect(adjustLeadBeats(1, true, 'locate')).toBe(1);
		expect(adjustLeadBeats(1, false, 'locate')).toBe(2);
		expect(adjustLeadBeats(2, false, 'locate')).toBe(4);
		expect(adjustLeadBeats(4, false, 'locate')).toBe(8);
		expect(adjustLeadBeats(8, false, 'locate')).toBe(8);
	});

	it('keeps identify cards at 1', () => {
		expect(adjustLeadBeats(1, true, 'identify')).toBe(1);
		expect(adjustLeadBeats(1, false, 'identify')).toBe(1);
	});
});
