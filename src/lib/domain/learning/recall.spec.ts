import { describe, expect, it } from 'vitest';
import { directRecallOf, type DirectRecall } from './recall';

type Fields = Parameters<DirectRecall>[0];

const response = (leadMs: number | null, reactionMs: number | null, success = true): Fields => ({
	success,
	reactionMs,
	leadBeats: null,
	tempoBpm: null,
	verdict: {
		relation: 'response',
		version: 1,
		value: { verdict: 'perfect', timingOffsetMs: 0, reactionMs, leadMs, expectations: [] }
	}
});

const older = (over: Partial<Fields>): Fields => ({
	success: true,
	reactionMs: 1600,
	leadBeats: 4,
	tempoBpm: 160,
	verdict: { relation: 'beat', version: 1, value: 'perfect' },
	...over
});

describe('directRecallOf', () => {
	it('reads a response envelope by its lead or its reaction', () => {
		expect(directRecallOf(1500)(response(1500, 3030))).toBe(true);
		expect(directRecallOf(1500)(response(1501, 3030))).toBe(false);
		expect(directRecallOf(3000)(response(null, 2900))).toBe(true);
		expect(directRecallOf(1500)(response(1500, 3030, false))).toBe(false);
	});

	it('reads older attempts by their lead and tempo, or their reaction', () => {
		expect(directRecallOf(1500)(older({}))).toBe(true);
		expect(directRecallOf(1500)(older({ tempoBpm: 80 }))).toBe(false);
		const named = older({
			leadBeats: null,
			tempoBpm: null,
			reactionMs: 2900,
			verdict: { relation: 'free', version: 1, value: 'perfect' }
		});
		expect(directRecallOf(3000)(named)).toBe(true);
		expect(directRecallOf(3000)({ ...named, reactionMs: 3001 })).toBe(false);
		expect(directRecallOf(1500)(older({ success: false }))).toBe(false);
		expect(directRecallOf(3000)({ ...named, success: false })).toBe(false);
		expect(directRecallOf(1500)(older({ tempoBpm: null }))).toBe(false);
	});

	it('never counts direct recall without a threshold', () => {
		expect(directRecallOf(null)(older({}))).toBe(false);
		expect(directRecallOf(null)(response(0, 0))).toBe(false);
	});
});
