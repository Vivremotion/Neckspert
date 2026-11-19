import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_EXERCISE_ITEMS,
	MAX_EXERCISE_LEVELS,
	MAX_LADDER_LEVELS,
	MAX_PASSAGE_MEMBERS,
	MAX_LEVEL_PARAMS,
	MAX_PASSAGE_EACH,
	MAX_PASSAGE_INDICES,
	MAX_ROUND_CHECKS,
	MAX_ROUND_EXPECTATIONS,
	MAX_SELECTION_FILTERS,
	MAX_SELECTION_ORDER
} from '$lib/domain/exercise';
import { MAX_GRID_CHANGES } from '$lib/domain/grid';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { LOCATE_NECK } from '$lib/testing/catalog';
import {
	alternatingGrid,
	LINK_CHORDS,
	LINK_PASSAGES,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
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

/**
 * The link as plan 4b writes its passages, as a definition file writes it, under `id`; with a
 * presentation, its set drawing no screen of its own until the changes are data.
 */
const linkJson = (id: string): Record<string, unknown> => ({
	...JSON.parse(JSON.stringify(LINK_PASSAGES)),
	presentation: { primary: 'Passage' },
	id
});

/** `count` params of a level, all under one object, as a hostile file would write them. */
const manyParams = (count: number, prefix = 'free') =>
	Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}.p${i}`, i]));

/** `exercise` whose round's one expectation asks `content`. */
function asking(exercise: Record<string, unknown>, content: unknown): Record<string, unknown> {
	const round = exercise.round as { expectations: Record<string, unknown>[] };
	return {
		...exercise,
		round: { ...round, expectations: round.expectations.map((e) => ({ ...e, content })) }
	};
}

/** Loads one imported file holding `exercise` (and `grids`); how long it took and what came of it. */
function timedLoad(exercise: Record<string, unknown>, grids: unknown[] = []) {
	const text = JSON.stringify({
		format: 0,
		skills: [TEST_PLACED_VOICING_SKILL],
		grids,
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
			levels
		});
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads an exercise listing 200 items at 100 levels of 200 params, just under the round checks allowed', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const { ms, refusals } = timedLoad({
			...arpeggioJson('h-wide'),
			items: Array.from({ length: 200 }, () => (ARPEGGIO_EXERCISE.items as unknown[])[0]),
			levels
		});
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads a selection with the most filters, each read in the params, at the most levels and ladder levels', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(MAX_LEVEL_PARAMS - 2, 'other') }
		}));
		const zones = Object.fromEntries(
			Array.from({ length: MAX_SELECTION_FILTERS }, (_, i) => [`z${i}`, [0, 24]])
		);
		const exercise = locateJson('h-selection');
		const { ms, refusals } = timedLoad(
			asking(
				{ ...exercise, params: { ...(exercise.params as object), ladder, zones }, levels },
				{
					family: 'note-places',
					where: Object.keys(zones).map((z) => ({ in: { frets: { param: `zones.${z}` } } })),
					order: Array.from({ length: MAX_SELECTION_ORDER }, () => 'position')
				}
			)
		);
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads a round with the most expectations, each a selection with the most filters read in the params, at the most levels and ladder levels', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(MAX_LEVEL_PARAMS - 2, 'other') }
		}));
		const zones = Object.fromEntries(
			Array.from({ length: MAX_SELECTION_FILTERS }, (_, i) => [`z${i}`, [0, 24]])
		);
		const exercise = locateJson('h-expectations');
		const round = exercise.round as { expectations: Record<string, unknown>[] };
		const [expectation] = round.expectations;
		const content = {
			family: 'note-places',
			where: Object.keys(zones).map((z) => ({ in: { frets: { param: `zones.${z}` } } }))
		};
		const { ms, refusals } = timedLoad({
			...exercise,
			// One item: what each listed item costs at each level is bounded by the round checks.
			items: (exercise.items as unknown[]).slice(0, 1),
			params: { ...(exercise.params as object), ladder, zones },
			levels,
			round: {
				...round,
				length: { bars: MAX_ROUND_EXPECTATIONS / 4, breath: true },
				expectations: Array.from({ length: MAX_ROUND_EXPECTATIONS }, (_, i) => ({
					...expectation,
					at: { beats: i },
					content
				}))
			}
		});
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads the most passage indices allowed, each on the widest zone of strings', () => {
		// Every zone of three neighbouring strings or more, the six strings first.
		const zones = [6, 5, 4, 3].flatMap((size) =>
			Array.from({ length: 7 - size }, (_, i) => Array.from({ length: size }, (_, k) => 6 - i - k))
		);
		const chords = [...LINK_CHORDS, 'Db'];
		const repeat = MAX_PASSAGE_INDICES / (chords.length * zones.length);
		expect(Number.isInteger(repeat)).toBe(true);
		const link = linkJson('h-indices');
		const { ms, refusals } = timedLoad({
			...link,
			passages: {
				...(link.passages as object),
				of: { chord: chords, strings: zones, n: Array.from({ length: repeat }, (_, i) => i) }
			}
		});
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads the most values of passage params, read by the most filters, at the most levels and ladder levels', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(MAX_LEVEL_PARAMS - 2, 'other') }
		}));
		const names = Array.from({ length: MAX_SELECTION_FILTERS }, (_, i) => `z${i}`);
		const link = linkJson('h-each');
		const filters = names.map((name) => ({ in: { frets: { param: name } } }));
		const { ms, refusals } = timedLoad(
			asking(
				{
					...link,
					params: { ladder },
					levels,
					passages: {
						...(link.passages as object),
						members: { family: 'chord-shapes', where: filters },
						each: Object.fromEntries(
							names.map((name) => [
								name,
								Array.from({ length: MAX_PASSAGE_EACH }, (_, i) => [0, i])
							])
						)
					}
				},
				{ family: 'chord-shapes', where: filters }
			)
		);
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads the most passage indices allowed on a grid of the most changes allowed', () => {
		const grid = alternatingGrid('h-grid', MAX_GRID_CHANGES);
		const zone = JSON.parse(JSON.stringify(ZONE_PASSAGES));
		const { ms, refusals } = timedLoad(
			{
				...zone,
				id: 'h-grid-indices',
				// Drawn by the grid's view, whose params are the changes' until Task 5.
				view: 'grid-scroll',
				params: {
					...zone.params,
					rule: 'jam',
					qualities: ['maj', 'min'],
					stringSets: [
						[3, 2, 1],
						[4, 3, 2]
					]
				},
				passages: {
					...zone.passages,
					of: {
						grid: ['h-grid'],
						n: Array.from({ length: MAX_PASSAGE_INDICES }, (_, i) => i)
					}
				}
			},
			[grid]
		);
		expect(refusals).toEqual([]);
		expect(MAX_GRID_CHANGES).toBeLessThanOrEqual(MAX_PASSAGE_MEMBERS);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('loads members and a round reading the same params with the most filters, at the most levels and ladder levels', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(MAX_LEVEL_PARAMS)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(MAX_LEVEL_PARAMS - 2, 'other') }
		}));
		const zones = Object.fromEntries(
			Array.from({ length: MAX_SELECTION_FILTERS }, (_, i) => [`z${i}`, [0, 24]])
		);
		const filters = Object.keys(zones).map((z) => ({ in: { frets: { param: `zones.${z}` } } }));
		const link = linkJson('h-shared');
		const { ms, refusals } = timedLoad(
			asking(
				{
					...link,
					params: { ladder, zones },
					levels,
					passages: {
						...(link.passages as object),
						members: { family: 'chord-shapes', where: filters, take: 4, andBack: true }
					}
				},
				{ family: 'chord-shapes', where: filters }
			)
		);
		expect(refusals).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('refuses fast passages over their limits', () => {
		const link = linkJson('h-over');
		const passages = link.passages as object;
		const cases: [unknown, string][] = [
			[
				{ ...passages, of: { chord: Array.from({ length: 50_000 }, (_, i) => i), x: [1, 2] } },
				'passages.of gives more than 500 indices'
			],
			[
				{ ...passages, each: { z: Array.from({ length: 50_000 }, () => [0, 24]) } },
				'passages.each.z has 50000 values, more than 64'
			]
		];
		for (const [written, reason] of cases) {
			const { ms, refusals } = timedLoad({ ...link, passages: written });
			expect(refusals).toEqual([{ file: 'h.json', kind: 'exercise', id: 'h-over', reason }]);
			expect(ms, reason).toBeLessThan(REFUSED_MS);
		}
	});

	it('refuses fast a round over its expectations', () => {
		const locate = locateJson('h-over');
		const round = locate.round as { expectations: Record<string, unknown>[] };
		const { ms, refusals } = timedLoad({
			...locate,
			round: { ...round, expectations: Array.from({ length: 1000 }, () => round.expectations[0]) }
		});
		expect(refusals).toEqual([
			{
				file: 'h.json',
				kind: 'exercise',
				id: 'h-over',
				reason: 'round.expectations has 1000 entries, more than 64'
			}
		]);
		expect(ms).toBeLessThan(REFUSED_MS);
	});

	it('refuses fast a selection over its limits', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({ params: {} }));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false }
		}));
		const locate = locateJson('h-over');
		const wide = {
			...locate,
			params: { ...(locate.params as object), ladder, z: 6 },
			levels
		};
		const cases: [unknown, string][] = [
			[
				{
					family: 'note-places',
					// As many filters read in the params as the file's size lets through.
					where: Array.from({ length: 40_000 }, () => ({ at: { param: 'z' } }))
				},
				'round.expectations[0].content.where has 40000 filters, more than 16'
			],
			[
				{ family: 'note-places', order: Array.from({ length: 9 }, () => 'position') },
				'round.expectations[0].content.order names 9 attributes, more than 8'
			]
		];
		for (const [content, reason] of cases) {
			const { ms, refusals } = timedLoad(asking(wide, content));
			expect(refusals).toEqual([{ file: 'h.json', kind: 'exercise', id: 'h-over', reason }]);
			expect(ms, reason).toBeLessThan(REFUSED_MS);
		}
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
