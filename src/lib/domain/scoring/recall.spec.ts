import { describe, expect, it } from 'vitest';
import { IDENTIFY_RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { isDirectRecall } from './recall';

const TEMPO = 80;

describe('isDirectRecall', () => {
	it('judges mode 2 on the reaction time', () => {
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
	});

	it('rejects a wrong name, however fast', () => {
		expect(isDirectRecall({ correct: false, reactionMs: 400, leadBeats: null }, TEMPO)).toBe(false);
	});

	it('rejects a mode 2 attempt without a reaction time', () => {
		expect(isDirectRecall({ correct: true, reactionMs: null, leadBeats: null }, TEMPO)).toBe(false);
	});

	it('judges mode 1 on the lead duration, not the reaction time', () => {
		expect(isDirectRecall({ correct: true, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(true);
		expect(isDirectRecall({ correct: true, reactionMs: 100, leadBeats: 4 }, TEMPO)).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(false);
	});
});
