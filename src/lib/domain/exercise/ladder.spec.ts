import { describe, expect, it } from 'vitest';
import { Fraction } from '$lib/domain/time/fraction';
import { ladderOf, validateLadder } from './ladder';
import type { ExerciseDefinition, Ladder } from './types';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE } from '$lib/testing/catalog';

/** Today's lead ladder at 80 bpm: 8 beats, 4, then 2 where only a direct recall counts. */
const leads = (first: Record<string, unknown>): Ladder => [
	{ params: { leadBeats: 8, ...first }, pass: { successes: 1 }, drop: { failures: 1 } },
	{ params: { leadBeats: 4 }, pass: { successes: 1 }, drop: { failures: 1 } },
	{
		params: { leadBeats: 2 },
		pass: { successes: 2 },
		drop: { failures: 1 },
		success: 'direct-recall'
	}
];
/** The ladder without what its first level shows. */
const LEADS = leads({});

const withLadder = (ladder: unknown): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { ...LOCATE_NECK.params, ladder }
});

describe('ladderOf', () => {
	it('reads the ladder an exercise writes, level by level, with what its first level shows', () => {
		expect(ladderOf(LOCATE_NECK)).toEqual(
			leads({ 'presentation.detail': '{fret}', 'presentation.picture': 'string' })
		);
		expect(ladderOf(TRIADS_ANCHOR)).toEqual(leads({ 'presentation.picture': 'lowest-shape' }));
		expect(ladderOf(TRIADS_ZONE)).toEqual(
			leads({
				'presentation.detail': {
					fr: '{strings} · fondamentale sur {rootString}',
					en: '{strings} · root on {rootString}'
				}
			})
		);
		expect(ladderOf(IDENTIFY_NECK)).toEqual([
			{
				params: { leadBeats: null, 'presentation.detail': '{name}' },
				pass: { successes: 1 },
				drop: { failures: 1 }
			},
			{
				params: { leadBeats: null },
				pass: { successes: 2 },
				drop: { failures: 1 },
				success: 'direct-recall'
			}
		]);
		expect(() => ladderOf({ ...LOCATE_NECK, params: {} })).toThrow(/locate-note-string.*ladder/);
	});

	it('reads no ladder from params.ladders', () => {
		const two: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ladders: { locate: LEADS, identify: ladderOf(IDENTIFY_NECK) } }
		};
		expect(() => ladderOf(two)).toThrow('locate-note-string: params.ladder is missing');
	});

	it('refuses an empty ladder, a lead that is not positive, a pass that is not a positive integer', () => {
		const level = LEADS[1];
		expect(validateLadder(LEADS)).toBeNull();
		expect(validateLadder([])).toMatch(/empty/);
		for (const leadBeats of [0, -2, Number.NaN, Infinity, 1.0001]) {
			expect(validateLadder([{ ...level, params: { leadBeats } }])).toMatch(/lead/);
		}
		for (const successes of [0, 1.5, -1]) {
			expect(validateLadder([{ ...level, pass: { successes } }])).toMatch(/pass/);
		}
		expect(validateLadder([{ ...level, drop: { failures: 0 } }])).toMatch(/drop/);
		expect(validateLadder([{ ...level, success: 'recall' as unknown as 'direct-recall' }])).toMatch(
			/level 0: .*success/
		);
		// A lead of a beat and a half: an exact fraction of a beat.
		expect(validateLadder([{ ...level, params: { leadBeats: 1.5 } }])).toBeNull();
		// The exercise that writes it is named with the field.
		expect(() => ladderOf(withLadder([]))).toThrow(/locate-note-string.*params\.ladder.*empty/);
		expect(() => ladderOf(withLadder('8, 4, 2'))).toThrow(/locate-note-string.*params\.ladder/);
	});

	it('takes a ladder of any leads, 6 and 3 in 3/4', () => {
		const waltz: Ladder = [
			{ params: { leadBeats: 6 }, pass: { successes: 1 }, drop: { failures: 1 } },
			{ params: { leadBeats: 3 }, pass: { successes: 3 }, success: 'direct-recall' }
		];
		const definition: ExerciseDefinition = {
			...withLadder(waltz),
			meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] }
		};
		expect(validateLadder(waltz)).toBeNull();
		expect(ladderOf(definition)).toEqual(waltz);
	});
});
