import { describe, expect, it } from 'vitest';
import {
	EXERCISES,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	exerciseById
} from './catalog';
import { Fraction } from '$lib/domain/time';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';

describe('exercise catalog', () => {
	it('describes the two neck exercises', () => {
		expect(LOCATE_NECK).toEqual({
			id: 'locate-neck',
			version: 1,
			mechanic: 'locate',
			view: 'note-lane',
			tempo: { fixed: 80 },
			params: { recallThresholdMs: 1500, ladder: ladderOf(LOCATE_NECK) }
		});
		expect(IDENTIFY_NECK).toEqual({
			id: 'identify-neck',
			version: 1,
			mechanic: 'identify',
			view: 'answer-keys',
			params: { recallThresholdMs: 3000, ladder: ladderOf(IDENTIFY_NECK) }
		});
	});

	it('finds an exercise by id and throws on an unknown one', () => {
		expect(exerciseById('identify-neck')).toBe(IDENTIFY_NECK);
		expect(() => exerciseById('nope')).toThrow(/nope/);
	});

	it('describes the two triads exercises of the memory track, each with its rhythm', () => {
		const params = {
			stringSets: [
				[3, 2, 1],
				[4, 3, 2]
			],
			qualities: ['maj', 'min'],
			pacing: { respirationBars: 1 },
			recallThresholdMs: 1500,
			ladder: [
				{ params: { leadBeats: 8, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
				{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 }, drop: { failures: 1 } },
				{
					params: { leadBeats: 2, aided: false },
					pass: { successes: 2 },
					drop: { failures: 1 },
					success: 'direct-recall'
				}
			]
		};
		expect(TRIADS_ANCHOR).toEqual({
			id: 'triads-anchor',
			version: 1,
			mechanic: 'triad-anchor',
			tempo: { fixed: 80 },
			params
		});
		expect(TRIADS_ZONE).toEqual({
			id: 'triads-zone',
			version: 1,
			mechanic: 'triad-zone',
			tempo: { fixed: 80 },
			params
		});
		expect(exerciseById('triads-zone')).toBe(TRIADS_ZONE);
		expect(pacingOf(TRIADS_ANCHOR)).toEqual(params.pacing);
		expect(TRIADS_ANCHOR.params).not.toBe(TRIADS_ZONE.params);
	});

	it('holds data only', () => {
		// Fractions are written as text (`1/4`, `0`) and read back as fractions; no other text in
		// the catalog looks like one.
		const fractionsBack = (_key: string, value: unknown) =>
			typeof value === 'string' && /^-?\d+(\/\d+)?$/.test(value) ? Fraction.parse(value) : value;
		expect(JSON.parse(JSON.stringify(EXERCISES), fractionsBack)).toEqual(EXERCISES);
	});

	it('plays locate and the triads at 80 bpm, fixed', () => {
		for (const exercise of [LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE]) {
			expect(exercise.tempo).toEqual({ fixed: 80 });
		}
	});
});
