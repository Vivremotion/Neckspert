import { DEFAULT_RESPIRATION_BARS } from '../exercise/pacing';
import { describe, expect, it } from 'vitest';
import { alignedPromptBeat, BEATS_PER_BAR, respirationStart } from './grid';

describe('alignedPromptBeat', () => {
	it('puts the target on the first beat of a bar for every lead', () => {
		for (const lead of [8, 4, 2]) {
			for (let earliest = 0; earliest < 16; earliest++) {
				const prompt = alignedPromptBeat(earliest, lead);
				expect(prompt).toBeGreaterThanOrEqual(earliest);
				expect((prompt + lead) % BEATS_PER_BAR).toBe(0);
				expect(prompt - earliest).toBeLessThan(BEATS_PER_BAR);
			}
		}
	});

	it('prompts on beat 1 at 8 and 4 beats, on beat 3 at 2 beats, never on 2 or 4', () => {
		expect(alignedPromptBeat(4, 8)).toBe(4);
		expect(alignedPromptBeat(4, 4)).toBe(4);
		expect(alignedPromptBeat(4, 2)).toBe(6);
		expect(alignedPromptBeat(5, 4)).toBe(8);
		expect(alignedPromptBeat(7, 2)).toBe(10);
	});
});

describe('respirationStart', () => {
	it('waits for the first beat of the bar after the target bar', () => {
		expect(DEFAULT_RESPIRATION_BARS).toBe(1);
		expect(respirationStart(8)).toBe(12);
	});
});
