import { describe, expect, it } from 'vitest';
import { Fraction } from '$lib/domain/time/fraction';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE } from './catalog';
import { ladderOf, leadStepsOf, learnedAfterOf, validateLadder } from './ladder';
import type { ExerciseDefinition, Ladder } from './types';

/** Today's lead ladder at 80 bpm: 8 beats aided, 4, then 2 where only a direct recall counts. */
const LEADS: Ladder = [
	{ params: { leadBeats: 8, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
	{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 }, drop: { failures: 1 } },
	{
		params: { leadBeats: 2, aided: false },
		pass: { successes: 2 },
		drop: { failures: 1 },
		success: 'direct-recall'
	}
];

const withLadder = (ladder: unknown): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { ...LOCATE_NECK.params, ladder }
});

describe('ladderOf', () => {
	it('reads the ladder an exercise writes, level by level', () => {
		expect(ladderOf(LOCATE_NECK)).toEqual(LEADS);
		expect(ladderOf(TRIADS_ANCHOR)).toEqual(LEADS);
		expect(ladderOf(TRIADS_ZONE)).toEqual(LEADS);
		expect(ladderOf(IDENTIFY_NECK)).toEqual([
			{ params: { leadBeats: null, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
			{
				params: { leadBeats: null, aided: false },
				pass: { successes: 2 },
				drop: { failures: 1 },
				success: 'direct-recall'
			}
		]);
		// An exercise of several mechanics writes one ladder per mechanic.
		const two: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ladders: { locate: LEADS, identify: ladderOf(IDENTIFY_NECK) } }
		};
		expect(ladderOf(two, 'locate')).toEqual(LEADS);
		expect(ladderOf(two, 'identify')).toEqual(ladderOf(IDENTIFY_NECK));
		expect(() => ladderOf(two, 'triad-anchor')).toThrow(/locate-neck.*ladder/);
		expect(() => ladderOf({ ...LOCATE_NECK, params: {} })).toThrow(/locate-neck.*ladder/);
	});

	it('refuses an empty ladder, a lead that is not positive, a pass that is not a positive integer', () => {
		const level = LEADS[1];
		expect(validateLadder(LEADS)).toBeNull();
		expect(validateLadder([])).toMatch(/empty/);
		for (const leadBeats of [0, -2, Number.NaN, Infinity]) {
			expect(validateLadder([{ ...level, params: { leadBeats, aided: false } }])).toMatch(/lead/);
		}
		for (const successes of [0, 1.5, -1]) {
			expect(validateLadder([{ ...level, pass: { successes } }])).toMatch(/pass/);
		}
		expect(validateLadder([{ ...level, drop: { failures: 0 } }])).toMatch(/drop/);
		// The exercise that writes it is named with the field.
		expect(() => ladderOf(withLadder([]))).toThrow(/locate-neck.*params\.ladder.*empty/);
		expect(() => ladderOf(withLadder('8, 4, 2'))).toThrow(/locate-neck.*params\.ladder/);
	});

	it('takes a ladder of any leads, 6 and 3 in 3/4', () => {
		const waltz: Ladder = [
			{ params: { leadBeats: 6, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
			{ params: { leadBeats: 3, aided: false }, pass: { successes: 3 }, success: 'direct-recall' }
		];
		const definition: ExerciseDefinition = {
			...withLadder(waltz),
			meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] }
		};
		expect(validateLadder(waltz)).toBeNull();
		expect(ladderOf(definition)).toEqual(waltz);
		expect(leadStepsOf(definition)).toEqual([6, 3]);
		expect(learnedAfterOf(definition)).toBe(3);
	});

	it('gives the old triad path its leads and the successes that learn (until H5)', () => {
		expect(leadStepsOf(TRIADS_ANCHOR)).toEqual([8, 4, 2]);
		expect(learnedAfterOf(TRIADS_ZONE)).toBe(2);
	});
});
