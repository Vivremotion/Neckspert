import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_EXERCISE_ITEMS,
	MAX_EXERCISE_LEVELS,
	MAX_LADDER_LEVELS,
	MAX_LEVEL_PARAMS,
	MAX_ROUND_CHECKS
} from '$lib/domain/exercise';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { LOCATE_NECK } from '$lib/testing/catalog';
import { TEST_PLACED_VOICING_SKILL } from '$lib/testing/testSkills';
import { CATALOG_FILES } from './catalogFiles';
import { loadDefinitions } from './definitions';

/**
 * What a file just under a limit may take to load; generous, so that a slow machine passes. The
 * slowest case below (levels × ladder levels, each with the most params) takes about 1.4 s here;
 * before the limits, files of this size took 2 to 17 s.
 */
const BUDGET_MS = 5_000;
/** What a file over a limit may take to be refused. */
const REFUSED_MS = 500;

/** The public arpeggio exercise as a definition file writes it, under `id`. */
function arpeggioJson(id: string): Record<string, unknown> {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return {
		...JSON.parse(JSON.stringify(rest)),
		id,
		figures: [
			{ id: 'quarters', lilypond: 'c4 c c c' },
			{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
		]
	};
}

/** Locate as a definition file writes it, under `id`. */
const locateJson = (id: string): Record<string, unknown> => ({
	...JSON.parse(JSON.stringify(LOCATE_NECK)),
	id
});

/** `count` params of a level, all under one object, as a hostile file would write them. */
const manyParams = (count: number, prefix = 'free') =>
	Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}.p${i}`, i]));

/** Loads one imported file holding `exercise`; how long it took and what came of it. */
function timedLoad(exercise: Record<string, unknown>) {
	const text = JSON.stringify({
		format: 0,
		skills: [TEST_PLACED_VOICING_SKILL],
		exercises: [exercise]
	});
	const start = performance.now();
	const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'h.json': text } });
	return { ms: performance.now() - start, ...imported };
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	loadDefinitions({ catalog: CATALOG_FILES });
});

describe('a definition file at the limits of what checking it may cost', () => {
	it('loads an exercise whose items × levels ask the most round checks allowed', () => {
		const levelCount = MAX_EXERCISE_LEVELS;
		const items = Array.from(
			{ length: MAX_ROUND_CHECKS / levelCount },
			() => (ARPEGGIO_EXERCISE.items as unknown[])[0]
		);
		const levels = [
			{ aid: true, params: { 'notation.tab': true } },
			...Array.from({ length: levelCount - 1 }, () => ({ params: {} }))
		];
		const { ms, registered, refusals } = timedLoad({ ...arpeggioJson('h-rounds'), items, levels });
		expect(refusals).toEqual([]);
		expect(registered.map((object) => object.id)).toContain('h-rounds');
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads an exercise with the most items allowed', () => {
		const items = Array.from(
			{ length: MAX_EXERCISE_ITEMS },
			() => (ARPEGGIO_EXERCISE.items as unknown[])[0]
		);
		const { ms, refusals } = timedLoad({ ...arpeggioJson('h-items'), items });
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads an exercise with the most levels and ladder levels, each with the most params', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(MAX_LEVEL_PARAMS - 2, 'other') }
		}));
		const exercise = locateJson('h-levels');
		const { ms, refusals } = timedLoad({
			...exercise,
			params: { ...(exercise.params as object), ladder },
			// A few items: the cost under test is the levels', not the catalog's 66 items'.
			items: (exercise.items as string[]).slice(0, 3),
			levels
		});
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('refuses fast what is over each limit', () => {
		const item = (ARPEGGIO_EXERCISE.items as unknown[])[0];
		const locate = locateJson('h-over');
		const cases: [Record<string, unknown>, string][] = [
			[
				{
					...arpeggioJson('h-over'),
					items: Array.from({ length: 1000 }, () => item),
					levels: Array.from({ length: 1000 }, () => ({ params: {} }))
				},
				'levels has 1000 entries, more than 100'
			],
			[
				{
					...arpeggioJson('h-over'),
					items: Array.from({ length: 1000 }, () => item),
					levels: Array.from({ length: 100 }, () => ({ params: {} }))
				},
				'items × levels asks 100000 round checks, more than 20000'
			],
			[
				{ ...arpeggioJson('h-over'), items: Array.from({ length: 20_000 }, () => item) },
				'items has 20000 entries, more than 2000'
			],
			[
				{ ...locate, levels: [{ params: manyParams(20_000) }] },
				'levels[0].params has 20000 entries, more than 200'
			],
			[
				{
					...locate,
					params: {
						ladder: Array.from({ length: 1500 }, () => ({
							params: { leadBeats: 2, aided: false }
						}))
					},
					levels: Array.from({ length: 1500 }, () => ({ params: {} }))
				},
				'levels has 1500 entries, more than 100'
			],
			[
				{
					...locate,
					params: {
						ladder: Array.from({ length: 1500 }, () => ({
							params: { leadBeats: 2, aided: false }
						}))
					}
				},
				'params.ladder has 1500 levels, more than 100'
			]
		];
		for (const [exercise, reason] of cases) {
			const { ms, refusals } = timedLoad(exercise);
			expect(refusals).toEqual([{ file: 'h.json', kind: 'exercise', id: 'h-over', reason }]);
			expect(ms, reason).toBeLessThan(REFUSED_MS);
		}
	});
});
