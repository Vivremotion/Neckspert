import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { GESTURE_ZONE, LOCATE_NECK, TRIADS_ZONE } from '$lib/testing/catalog';
import {
	CheckBudget,
	CheckBudgetExceeded,
	compiledExtra,
	levelsCheckCost,
	MAX_FILE_CHECK_COST,
	PARAM_ENTRIES_PER_UNIT,
	roundCheckCost,
	roundCheckWeight
} from './checkCost';
import type { RoundTemplate } from './round/types';

describe('roundCheckWeight', () => {
	it('weighs a round 1, plus each expectation, plus the filters of each selection', () => {
		// One expectation, a selection without filters.
		expect(roundCheckWeight(LOCATE_NECK.round)).toBe(2);
		// One expectation, a selection of one filter.
		expect(roundCheckWeight(GESTURE_ZONE.round)).toBe(3);
		const [expectation] = LOCATE_NECK.round!.expectations;
		const round: RoundTemplate = {
			...LOCATE_NECK.round!,
			expectations: [
				{
					...expectation,
					content: {
						family: 'note-places',
						where: [{ in: { frets: [0, 5] } }, { in: { frets: [0, 7] } }]
					}
				},
				{ ...expectation, content: { from: 'name-of-item' } },
				{ ...expectation, content: null }
			]
		};
		expect(roundCheckWeight(round)).toBe(1 + 3 + 2);
	});

	it('weighs a figure entry as one expectation, its notes charged once compiled', () => {
		expect(roundCheckWeight(ARPEGGIO_EXERCISE.round)).toBe(2);
		expect(compiledExtra(ARPEGGIO_EXERCISE.round, 8)).toBe(7);
		expect(compiledExtra(LOCATE_NECK.round, 1)).toBe(0);
	});

	it('weighs what it cannot read as a round of nothing', () => {
		expect(roundCheckWeight(undefined)).toBe(1);
		expect(roundCheckWeight({ expectations: 'x' } as unknown as RoundTemplate)).toBe(1);
	});
});

describe('the cost of params', () => {
	const keys = (count: number) =>
		Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));

	it('adds to a round the params it reads, as many as its most written level and its first ladder level', () => {
		const base = Object.keys(LOCATE_NECK.params).length + 4;
		const ladder = (LOCATE_NECK.params.ladder as { params: object }[])[0].params;
		const first = Object.keys(ladder).length;
		const units = (entries: number) => Math.ceil(entries / PARAM_ENTRIES_PER_UNIT);
		expect(roundCheckCost(LOCATE_NECK)).toBe(2 + units(base + first));
		const levels = [{ params: keys(3) }, { params: keys(160) }];
		expect(roundCheckCost({ ...LOCATE_NECK, levels })).toBe(2 + units(base + 160 + first));
	});

	it('counts every level resolved over every ladder level, and a sweep, before any is', () => {
		const plain = levelsCheckCost({ ...LOCATE_NECK, levels: [{ params: {} }] });
		const wide = levelsCheckCost({
			...LOCATE_NECK,
			levels: Array.from({ length: 100 }, () => ({ params: keys(200) }))
		});
		// Each of the 100 levels writes 200 more entries, resolved once alone, once over each of
		// the ladder's levels, and once in a sweep.
		const ladder = (LOCATE_NECK.params.ladder as unknown[]).length;
		expect(wide - plain).toBeGreaterThanOrEqual(
			Math.floor((100 * 200 * (ladder + 2)) / PARAM_ENTRIES_PER_UNIT)
		);
	});

	it('reads nothing it cannot count', () => {
		expect(
			levelsCheckCost({ ...LOCATE_NECK, levels: 'x' as never, params: 3 as never })
		).toBeLessThanOrEqual(2);
	});
});

describe('the cost of a path through an object', () => {
	it('counts the whole object a level’s path runs through, once a resolution', () => {
		const big = Object.fromEntries(Array.from({ length: 1_600 }, (_, i) => [`k${i}`, 0]));
		const exercise = { ...LOCATE_NECK, params: { ...LOCATE_NECK.params, big } };
		const plain = levelsCheckCost({ ...exercise, levels: [{ params: { other: 1 } }] });
		const through = levelsCheckCost({
			...exercise,
			levels: [{ params: { 'big.a': 1, 'big.b': 2 } }]
		});
		// The 1 600 keys copied once for both paths, at each of the level's resolutions.
		expect(through - plain).toBeGreaterThanOrEqual(1_600 / PARAM_ENTRIES_PER_UNIT);
		expect(through - plain).toBeLessThan((2 * 1_600 * 10) / PARAM_ENTRIES_PER_UNIT);
	});
});

describe('the cost of what a level writes', () => {
	const keys = (count: number) =>
		Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));

	it('charges a value a level writes at its nested size, and a ladder path through it at each resolution over it', () => {
		const ladder = Array.from({ length: 10 }, (_, i) => ({
			params: { leadBeats: 2, [`big.b${i}`]: 1 }
		}));
		const exercise = { ...LOCATE_NECK, params: { ...LOCATE_NECK.params, ladder } };
		const plain = levelsCheckCost({ ...exercise, levels: [{ params: { big: 1 } }] });
		const big = levelsCheckCost({
			...exercise,
			levels: [{ params: { big: { nested: keys(1_600) } } }]
		});
		// 1 601 entries written once, and copied by each of the 10 ladder levels' paths.
		expect(big - plain).toBeGreaterThanOrEqual(Math.floor((10 * 1_601) / PARAM_ENTRIES_PER_UNIT));
	});

	it('charges a ladder level a sweep lays only for the paths a selection reads', () => {
		const ladder = Array.from({ length: 50 }, () => ({
			params: { leadBeats: 2, ...keys(100) }
		}));
		const levels = Array.from({ length: 50 }, () => ({ params: keys(100) }));
		const exercise = { ...LOCATE_NECK, params: { ...LOCATE_NECK.params, ladder }, levels };
		const [expectation] = LOCATE_NECK.round!.expectations;
		const reading = {
			...exercise,
			round: {
				...LOCATE_NECK.round!,
				expectations: [
					{ ...expectation, content: { family: 'note-places', where: [{ at: { param: 'k3' } }] } }
				]
			}
		};
		expect(levelsCheckCost(reading)).toBeGreaterThan(levelsCheckCost(exercise));
	});

	it('charges the sweep of the params the member asked reads, a sweep of its own', () => {
		// The reviewer's shape: a zone of many keys, a ladder writing the zone's frets at every
		// level, many exercise levels; the member asked reads the zone's frets or nothing.
		const ladder = Array.from({ length: 100 }, () => ({
			params: { leadBeats: 2, 'zone.frets': [1, 24] }
		}));
		const levels = Array.from({ length: 100 }, (_, i) => ({ params: { [`free${i}`]: 1 } }));
		const exercise = {
			...TRIADS_ZONE,
			params: { ...TRIADS_ZONE.params, zone: { frets: [1, 24], ...keys(200) }, ladder },
			levels
		};
		const asking = (asks: unknown) => ({
			...exercise,
			params: {
				...exercise.params,
				learning: { ...(TRIADS_ZONE.params?.learning as object), asks }
			}
		});
		const plain = levelsCheckCost(
			asking({ family: 'chord-shapes', where: [{ other: 'previous' }] })
		);
		const reading = levelsCheckCost(
			asking({ family: 'chord-shapes', where: [{ in: { frets: { param: 'zone.frets' } } }] })
		);
		expect(reading).toBeGreaterThan(plain);
	});
});

describe('the cost of a presentation rewritten at the levels', () => {
	const ladderWriting = (path: string) =>
		Array.from({ length: 100 }, () => ({
			params: { leadBeats: 2, [path]: '{fret}' }
		}));
	const levels = Array.from({ length: 100 }, () => ({ params: {} }));

	it('charges the presentation checked at each ladder level that rewrites it, over each exercise level', () => {
		const rewriting = (path: string) =>
			levelsCheckCost({
				...LOCATE_NECK,
				levels,
				params: { ...LOCATE_NECK.params, ladder: ladderWriting(path) }
			});
		const size = Object.keys(LOCATE_NECK.presentation!).length;
		// 100 × 100 presentations copied by the params' resolution, then resolved and checked again.
		expect(rewriting('presentation.detail') - rewriting('other.detail')).toBeGreaterThanOrEqual(
			Math.floor((100 * 100 * 2 * size) / PARAM_ENTRIES_PER_UNIT)
		);
	});

	it('charges nothing more for an exercise that writes no presentation, refused before', () => {
		const unpresented = { ...LOCATE_NECK, presentation: undefined, levels };
		const cost = (path: string) =>
			levelsCheckCost({
				...unpresented,
				params: { ...LOCATE_NECK.params, ladder: ladderWriting(path) }
			});
		expect(cost('presentation.detail')).toBe(cost('other.detail'));
	});
});

describe('CheckBudget', () => {
	it('charges up to its most, then refuses in words, the cost reached and the most named', () => {
		const budget = new CheckBudget(10);
		budget.charge(6);
		budget.charge(4);
		expect(budget.spent).toBe(10);
		expect(budget.left).toBe(0);
		expect(budget.refusal).toBeNull();
		expect(() => budget.charge(3)).toThrow(CheckBudgetExceeded);
		expect(budget.refusal).toBe(
			'this file asks more checking than a start can afford (cost 13, at most 10)'
		);
		// Over once, over for good: the same words.
		expect(() => budget.charge(0)).toThrow(budget.refusal!);
		expect(budget.spent).toBe(10);
	});

	it('holds a file’s budget by default', () => {
		expect(new CheckBudget().max).toBe(MAX_FILE_CHECK_COST);
	});
});
