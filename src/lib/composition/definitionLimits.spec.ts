import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_EXERCISE_ITEMS,
	MAX_EXERCISE_LEVELS,
	MAX_LADDER_LEVELS,
	MAX_PASSAGE_MEMBERS,
	MAX_LEVEL_PARAMS,
	MAX_PASSAGE_EACH,
	MAX_PASSAGE_INDICES,
	MAX_PASSAGE_ROUND_CHECKS,
	MAX_ROUND_CHECKS,
	MAX_ROUND_EXPECTATIONS,
	MAX_FILE_CHECK_COST,
	MAX_SELECTION_FILTERS,
	MAX_SELECTION_ORDER,
	type CheckBudget
} from '$lib/domain/exercise';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions';
import { clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids } from '$lib/domain/grid/registry';
import { clearRoutines } from '$lib/domain/routine/registry';
import { clearSkills } from '$lib/domain/skill/registry';
import { MAX_GRID_CHANGES } from '$lib/domain/grid';
import { MAX_DEFINITION_FILE_CHARS } from '$lib/domain/definitions/file';
import {
	MAX_OPENING_DEPTH,
	MAX_OPENING_TERMS,
	MAX_ROUTINE_EXERCISES,
	type Opening
} from '$lib/domain/routine/types';
import { routines } from '$lib/domain/routine/registry';
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
/**
 * What the slowest file the check budget accepts may take to load: about 1.2 s here (Apple M3
 * Pro), for a file of exercises of the lightest rounds on a grid of the most changes.
 */
const WORST_ACCEPTED_MS = 2_000;

/**
 * What checking each file cost, read on the budget each exercise's check was given, and what the
 * load refused; the registries filled with `files` alone.
 */
function checkCosts(files: Readonly<Record<string, string>>) {
	clearSkills();
	clearGrids();
	clearExercises();
	clearRoutines();
	const checks = definitionChecks();
	const budgets = new Map<string, CheckBudget>();
	const { refusals, registered } = registerFiles(files, {
		exercise(exercise, budget) {
			budgets.set(exercise.id, budget!);
			return checks.exercise(exercise, budget);
		}
	});
	const costs: Record<string, number> = {};
	for (const { file, kind, id } of [...registered, ...refusals]) {
		const budget = kind === 'exercise' && id !== null ? budgets.get(id) : undefined;
		if (budget) costs[file] = budget.spent;
	}
	return { costs, refusals };
}

/**
 * A grid exercise on a grid of the most changes, as many indices as its rounds checked allow,
 * each round of `expectations` selections of `filters` filters: the file plan 4b measured at the
 * most of each (28 s to load before the budget).
 */
function gridExercise(id: string, expectations: number, filters: number) {
	const zone = JSON.parse(JSON.stringify(ZONE_PASSAGES));
	const [expectation] = zone.round.expectations;
	const names = Array.from({ length: filters }, (_, i) => `z${i}`);
	const where = names.map((name) => ({ in: { frets: { param: name } } }));
	return {
		...zone,
		id,
		passages: {
			...zone.passages,
			of: {
				grid: ['h-grid'],
				n: Array.from(
					{ length: Math.floor(MAX_PASSAGE_ROUND_CHECKS / MAX_GRID_CHANGES) },
					(_, i) => i
				)
			},
			each: Object.fromEntries(names.map((name) => [name, [[0, 24]]]))
		},
		round: {
			...zone.round,
			// Within the change's four beats, a sixteenth apart.
			expectations: Array.from({ length: expectations }, (_, i) => ({
				...expectation,
				at: { beats: i / 16 },
				content: { family: 'chord-shapes', ...(filters > 0 && { where }) }
			}))
		}
	};
}

/** A file of the grid of the most changes and `exercises`, as `timedLoad` reads it. */
function gridFileLoad(exercises: unknown[]) {
	const text = JSON.stringify({
		format: 0,
		skills: [TEST_PLACED_VOICING_SKILL],
		grids: [alternatingGrid('h-grid', MAX_GRID_CHANGES)],
		exercises
	});
	const start = performance.now();
	const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'h.json': text } });
	return { ms: performance.now() - start, text, ...imported };
}

const budgetWords = (cost: number) =>
	`this file asks more checking than a start can afford (cost ${cost}, at most ${MAX_FILE_CHECK_COST})`;

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

/** The link as the catalog writes its passages, as a definition file writes it, under `id`. */
const linkJson = (id: string): Record<string, unknown> => ({
	...JSON.parse(JSON.stringify(LINK_PASSAGES)),
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

	it('loads the most passage indices whose rounds are checked on a grid of the most changes allowed, and refuses more', () => {
		const grid = alternatingGrid('h-grid', MAX_GRID_CHANGES);
		const zone = JSON.parse(JSON.stringify(ZONE_PASSAGES));
		const indexed = (count: number) => ({
			...zone,
			id: 'h-grid-indices',
			passages: {
				...zone.passages,
				of: { grid: ['h-grid'], n: Array.from({ length: count }, (_, i) => i) }
			}
		});
		// Each index's first passage has a round per change: the rounds checked bound the indices.
		const most = Math.floor(MAX_PASSAGE_ROUND_CHECKS / MAX_GRID_CHANGES);
		const loaded = timedLoad(indexed(most), [grid]);
		expect(loaded.refusals).toEqual([]);
		expect(MAX_GRID_CHANGES).toBeLessThanOrEqual(MAX_PASSAGE_MEMBERS);
		expect(loaded.ms).toBeLessThan(BUDGET_MS);

		const refused = timedLoad(indexed(MAX_PASSAGE_INDICES), [grid]);
		expect(refused.refusals.map((refusal) => refusal.reason)).toEqual([
			`passages gives ${MAX_PASSAGE_INDICES * MAX_GRID_CHANGES} rounds to check in the first passage of each index, more than ${MAX_PASSAGE_ROUND_CHECKS}`
		]);
		expect(refused.ms).toBeLessThan(BUDGET_MS);
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

	it('refuses the file at the most passage rounds, expectations and filters at once, in the budget’s words', () => {
		const loaded = gridFileLoad([
			gridExercise('h-heavy', MAX_ROUND_EXPECTATIONS, MAX_SELECTION_FILTERS)
		]);
		// Each round weighs 1 + 64 + 64 × 16: refused at the first that passes the budget.
		const weight = 1 + MAX_ROUND_EXPECTATIONS * (1 + MAX_SELECTION_FILTERS);
		const cost = (Math.floor(MAX_FILE_CHECK_COST / weight) + 1) * weight;
		expect(loaded.refusals).toEqual([
			{ file: 'h.json', kind: 'exercise', id: 'h-heavy', reason: budgetWords(cost) }
		]);
		expect(loaded.ms).toBeLessThan(BUDGET_MS);
	});

	it('loads the slowest file the budget accepts within its time, and refuses one exercise more', () => {
		// The lightest rounds (one expectation, no filter) on the longest grid: the most rounds.
		const light = (id: string) => gridExercise(id, 1, 0);
		const { costs, refusals } = checkCosts({
			...CATALOG_FILES,
			'h.json': JSON.stringify({
				format: 0,
				skills: [TEST_PLACED_VOICING_SKILL],
				grids: [alternatingGrid('h-grid', MAX_GRID_CHANGES)],
				exercises: [light('h-light')]
			})
		});
		expect(refusals).toEqual([]);
		const most = Math.floor(MAX_FILE_CHECK_COST / costs['h.json']);
		expect(most).toBeGreaterThan(1);
		const ids = Array.from({ length: most + 1 }, (_, i) => `h-light-${i}`);
		const loaded = gridFileLoad(ids.slice(0, most).map(light));
		expect(loaded.refusals).toEqual([]);
		expect(loaded.text.length).toBeLessThan(MAX_DEFINITION_FILE_CHARS);
		expect(loaded.ms).toBeLessThan(WORST_ACCEPTED_MS);

		const over = gridFileLoad(ids.map(light));
		expect(over.refusals).toHaveLength(1);
		expect(over.refusals[0]).toMatchObject({ kind: 'exercise', id: ids[most] });
		expect(over.refusals[0].reason).toMatch(
			/^this file asks more checking than a start can afford \(cost \d+, at most \d+\)$/
		);
	});

	it('loads the catalog with no refusal, each file far within its check budget', () => {
		const { costs, refusals } = checkCosts(CATALOG_FILES);
		expect(refusals).toEqual([]);
		expect(Object.keys(costs).length).toBeGreaterThan(0);
		for (const [file, cost] of Object.entries(costs)) {
			expect(cost, file).toBeLessThan(MAX_FILE_CHECK_COST / 50);
		}
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

	it('loads a routine of the most exercises allowed, opening at the most terms and depth', () => {
		const ids = Array.from({ length: MAX_ROUTINE_EXERCISES }, (_, i) => `h-memory-${i}`);
		const skills = ids.map((id) => ({
			id,
			name: { fr: id, en: id },
			items: 'note-on-string',
			memory: true,
			directRecall: { withinMs: 1500 }
		}));
		const exercises = ids.map((id) => ({ ...locateJson(id), practices: id }));
		const leaf: Opening = { acquired: { skill: ids[0], atLeast: 1 } };
		let deep: Opening = { level: { exercise: ids[1], scope: 's', atLeast: 2 } };
		// `all` › `any` … › the level: as deep as allowed; the leaves fill the terms.
		for (let depth = 2; depth < MAX_OPENING_DEPTH; depth++) deep = { any: [deep] };
		const opens: Opening = {
			all: [deep, ...Array.from({ length: MAX_OPENING_TERMS - MAX_OPENING_DEPTH }, () => leaf)]
		};
		const text = JSON.stringify({
			format: 0,
			skills,
			exercises,
			routines: [{ id: 'h-routine', title: { fr: 'h', en: 'h' }, exercises: ids, opens }]
		});
		const start = performance.now();
		const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'h.json': text } });
		const ms = performance.now() - start;
		expect(imported.refusals).toEqual([]);
		expect(routines().find((r) => r.id === 'h-routine')?.exercises).toEqual(ids);
		expect(ms).toBeLessThan(BUDGET_MS);
	});
});
