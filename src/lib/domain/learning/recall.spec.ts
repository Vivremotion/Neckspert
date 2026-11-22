import { describe, expect, it } from 'vitest';
import { skillById } from '$lib/domain/skill/registry';
import { directRecallOf, directRecallWithin, type DirectRecall } from './recall';

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

describe('directRecallWithin', () => {
	it('reads a response envelope by its lead or its reaction', () => {
		expect(directRecallWithin(1500)(response(1500, 3030))).toBe(true);
		expect(directRecallWithin(1500)(response(1501, 3030))).toBe(false);
		expect(directRecallWithin(3000)(response(null, 2900))).toBe(true);
		expect(directRecallWithin(1500)(response(1500, 3030, false))).toBe(false);
	});

	it('reads older attempts by their lead and tempo, or their reaction', () => {
		expect(directRecallWithin(1500)(older({}))).toBe(true);
		expect(directRecallWithin(1500)(older({ tempoBpm: 80 }))).toBe(false);
		const named = older({
			leadBeats: null,
			tempoBpm: null,
			reactionMs: 2900,
			verdict: { relation: 'free', version: 1, value: 'perfect' }
		});
		expect(directRecallWithin(3000)(named)).toBe(true);
		expect(directRecallWithin(3000)({ ...named, reactionMs: 3001 })).toBe(false);
		expect(directRecallWithin(1500)(older({ success: false }))).toBe(false);
		expect(directRecallWithin(3000)({ ...named, success: false })).toBe(false);
		expect(directRecallWithin(1500)(older({ tempoBpm: null }))).toBe(false);
	});
});

describe('directRecallOf', () => {
	it('judges by the time the skill writes', () => {
		const locate = directRecallOf(skillById('locate-note-string'))!;
		expect(locate(response(1500, 3030))).toBe(true);
		expect(locate(response(1501, 3030))).toBe(false);
		const naming = directRecallOf(skillById('identify-note'))!;
		expect(naming(response(null, 3000))).toBe(true);
		expect(naming(response(null, 3001))).toBe(false);
	});

	it('gives no rule to a skill that writes no direct recall', () => {
		expect(directRecallOf(skillById('inner-pulse'))).toBeNull();
	});
});
