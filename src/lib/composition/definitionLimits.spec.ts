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
	CheckBudget,
	levelsCheckCost,
	MAX_FILE_CHECK_COST,
	roundCheckCost,
	validateExercise,
	MAX_SELECTION_FILTERS,
	MAX_SELECTION_ORDER
} from '$lib/domain/exercise';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions';
import { clearExercises, exerciseById } from '$lib/domain/exercise/registry';
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
import { LOCATE_NECK, RHYTHM_SILENT_BARS } from '$lib/testing/catalog';
import { compileRound, figureItemsAt, RoundCompileError } from '$lib/domain/exercise/round';
import { alignAttacks, alignContext, timeExpectations } from '$lib/domain/time/judge/align';
import { createTempoMap } from '$lib/domain/time/tempoMap';
import { Fraction } from '$lib/domain/time/fraction';
import { METER_4_4 } from '$lib/domain/time/meter';
import {
	alternatingGrid,
	LINK_CHORDS,
	LINK_PASSAGES,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
import { TEST_PLACED_VOICING_SKILL } from '$lib/testing/testSkills';
import { placedVoicingSet } from '$lib/domain/sets/placedVoicing';
import { CATALOG_FILES } from './catalogFiles';
import { loadDefinitions } from './definitions';

/**
 * What a file just under a limit may take to load, or one over the check budget to be refused;
 * generous, so that a slow machine passes. The slowest case below (the lightest grid exercises
 * the budget accepts, then one more refused) takes about 1.6 s here; before the limits, files took
 * 2 to 17 s, and before the budget up to 28 s.
 */
const BUDGET_MS = 5_000;
/** What a file over a limit may take to be refused. */
const REFUSED_MS = 500;
/**
 * What the slowest file the check budget accepts may take to load, a tripwire about three times
 * what it takes here (Apple M3 Pro): 0.85 s for a file of exercises of the lightest rounds on a
 * grid of the most changes, 0.5 s for the levels at the most params the budget accepts.
 */
const WORST_ACCEPTED_MS = 3_600;

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

/**
 * The params each exercise and ladder level writes in the tests at the most levels and ladder
 * levels, beside their rounds' own cost: every level's params are resolved over every other's
 * and copied by every round, and the budget charges it, so the most params allowed
 * (`MAX_LEVEL_PARAMS`) at every level do not fit beside many rounds; the levels at the most params
 * the budget accepts are tested on their own (`levelsRecipe`).
 */
const PARAMS_IN_BUDGET = 8;

/**
 * Locate, as the notes' catalog writes it, at the most levels and ladder levels, each writing
 * `params` short keys: the reviewer's recipe of plan 5b.
 */
function levelsRecipe(id: string, params: number) {
	const keys = (count: number) =>
		Object.fromEntries(Array.from({ length: count }, (_, i) => [i.toString(36), 0]));
	const exercise = locateJson(id);
	const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({ params: keys(params) }));
	const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
		params: { ...keys(params - 2), leadBeats: 2, aided: false }
	}));
	return { ...exercise, params: { ...(exercise.params as object), ladder }, levels };
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

/** The catalog's silent bars as its file writes it, under `id`. */
function rhythmJson(id: string): Record<string, unknown> {
	const file = Object.entries(CATALOG_FILES).find(([name]) => name.endsWith('rhythm.json'))!;
	const exercise = (JSON.parse(file[1]).exercises as Record<string, unknown>[]).find(
		(e) => e.id === RHYTHM_SILENT_BARS.id
	)!;
	return { ...exercise, id };
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

	it('loads an exercise with the most levels and ladder levels, each with a few params', () => {
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(PARAMS_IN_BUDGET)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(PARAMS_IN_BUDGET - 2, 'other') }
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

	it('loads an exercise listing 200 items at 100 levels with params, just under the round checks allowed', () => {
		// Each of the 20 000 rounds copies its level's params: few of them fit the budget.
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, () => ({
			params: manyParams(16)
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
			params: manyParams(PARAMS_IN_BUDGET)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(PARAMS_IN_BUDGET - 2, 'other') }
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
			params: manyParams(PARAMS_IN_BUDGET)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(PARAMS_IN_BUDGET - 2, 'other') }
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
			params: manyParams(PARAMS_IN_BUDGET)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(PARAMS_IN_BUDGET - 2, 'other') }
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
			params: manyParams(PARAMS_IN_BUDGET)
		}));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, () => ({
			params: { leadBeats: 2, aided: false, ...manyParams(PARAMS_IN_BUDGET - 2, 'other') }
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
		// Its levels charged first, then each round (1 + 64 + 64 × 16, and its params): refused at
		// the first round that passes the budget.
		const exercise = gridExercise('h-heavy', MAX_ROUND_EXPECTATIONS, MAX_SELECTION_FILTERS);
		const levels = levelsCheckCost(exercise);
		const weight = roundCheckCost(exercise);
		expect(weight).toBeGreaterThan(MAX_ROUND_EXPECTATIONS * (1 + MAX_SELECTION_FILTERS));
		const cost = levels + (Math.floor((MAX_FILE_CHECK_COST - levels) / weight) + 1) * weight;
		expect(loaded.refusals).toEqual([
			{ file: 'h.json', kind: 'exercise', id: 'h-heavy', reason: budgetWords(cost) }
		]);
		expect(loaded.ms).toBeLessThan(BUDGET_MS);
	});

	it('loads the levels at the most params the budget accepts, and refuses one param more in its words', () => {
		// 59 params at each of 100 levels and 100 ladder levels: about 296 000, loaded in about
		// 0.45 s here (Apple M3 Pro); 60: about 312 000.
		const accepted = timedLoad(levelsRecipe('h-recipe', 59));
		expect(accepted.refusals).toEqual([]);
		expect(accepted.ms).toBeLessThan(WORST_ACCEPTED_MS);
		const over = timedLoad(levelsRecipe('h-recipe', 60));
		expect(over.refusals).toHaveLength(1);
		expect(over.refusals[0].reason).toMatch(
			/^this file asks more checking than a start can afford \(cost \d+, at most 300000\)$/
		);
		expect(over.ms).toBeLessThan(BUDGET_MS);
	});

	it('refuses fast levels whose paths run through a large object of the params, which each resolution copies', () => {
		// One object of 5 000 keys, a path through it at each of 100 levels and 100 ladder levels:
		// 16 s to load before each resolution was charged what it copies.
		const exercise = locateJson('h-nested');
		const params = exercise.params as Record<string, unknown>;
		const big = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`k${i}`, 0]));
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, (_, i) => ({
			params: { leadBeats: 2, aided: false, [`big.b${i}`]: 1 }
		}));
		const levels = Array.from({ length: MAX_EXERCISE_LEVELS }, (_, i) => ({
			params: { [`big.a${i}`]: 1 }
		}));
		const { ms, refusals } = timedLoad({ ...exercise, params: { ...params, big, ladder }, levels });
		expect(refusals).toHaveLength(1);
		expect(refusals[0].reason).toMatch(
			/^this file asks more checking than a start can afford \(cost \d+, at most 300000\)$/
		);
		expect(ms).toBeLessThan(REFUSED_MS);
	});

	it('refuses fast an exercise level that writes a large object, which each ladder level’s path through it copies', () => {
		// Accepted before, as the paths were walked through the exercise's own params only:
		// one level writing 80 000 keys loaded in 3.3 s, a hundred writing 800 each in 6.3 s.
		const keys = (count: number, prefix: string) =>
			Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, 0]));
		const exercise = locateJson('h-written');
		const params = exercise.params as { ladder: { params: object }[] };
		const ladder = Array.from({ length: MAX_LADDER_LEVELS }, (_, i) => ({
			params: {
				...params.ladder[Math.min(i, params.ladder.length - 1)].params,
				[`big.b${i}`]: 1
			}
		}));
		for (const levels of [
			[{ params: { big: keys(80_000, 'k') } }],
			Array.from({ length: MAX_EXERCISE_LEVELS }, (_, i) => ({
				params: { big: keys(800, `k${i}_`) }
			}))
		]) {
			const { ms, refusals } = timedLoad({ ...exercise, params: { ...params, ladder }, levels });
			expect(refusals).toHaveLength(1);
			expect(refusals[0].reason).toMatch(
				/^this file asks more checking than a start can afford \(cost \d+, at most 300000\)$/
			);
			expect(ms).toBeLessThan(REFUSED_MS);
		}
	});

	it('refuses the levels at the most params, three times in a file, within its time', () => {
		// 5.8 s to load before the levels were charged; refused in about 0.8 s here.
		const text = JSON.stringify({
			format: 0,
			exercises: [0, 1, 2].map((i) => levelsRecipe(`h-recipe-${i}`, MAX_LEVEL_PARAMS))
		});
		const start = performance.now();
		const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'h.json': text } });
		expect(performance.now() - start).toBeLessThan(BUDGET_MS);
		expect(imported.refusals.map((refusal) => refusal.reason)).toEqual(
			Array(3).fill(imported.refusals[0].reason)
		);
		expect(imported.refusals[0].reason).toMatch(/^this file asks more checking than a start/);
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

	it('refuses fast an item whose round would span past what a round may, naming it', () => {
		// 2 000 000 beats of thirty-second notes: 15.5 s to refuse once expanded; now before.
		const item = ARPEGGIO_EXERCISE.items![0] as { item: string };
		const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
		const { ms, refusals } = timedLoad({
			...JSON.parse(JSON.stringify(rest)),
			id: 'h-long',
			figures: [
				{ id: 'quarters', lilypond: `c32 ${'c '.repeat(31)}` },
				{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
			],
			items: [{ item: item.item, beats: 2_000_000 }]
		});
		expect(refusals).toHaveLength(1);
		expect(refusals[0].reason).toMatch(
			new RegExp(
				`^items\\[0\\] \\(${JSON.stringify(item.item).replace(/[|()]/g, '\\$&')}\\) does not compile at exercise level -1: round\\.length spans 500000 bars, more than the 1024 a round may span$`
			)
		);
		expect(ms).toBeLessThan(REFUSED_MS);
	});

	it('refuses fast an exercise without items whose served figure would expand past what a round may hold, at load and at play', () => {
		// The catalog's silent bars over 400 bars of thirty-second notes; and over 400 000 bars (1.8 s
		// to compile once played), and 50 000 000 bars with the figure at their end (accepted in
		// 4.3 s, 25 000 000 muted bars once played), before the load checked every figure served.
		const rhythm = rhythmJson('h-long-cycle');
		const cases: [Record<string, unknown>, string][] = [
			[
				{
					params: { ...(rhythm.params as object), cycleBars: 400 },
					figures: [{ id: 'eighths', lilypond: 'c32 '.repeat(32) }]
				},
				'figures ("eighths") does not compile at exercise level -1: round.expectations[0].figure would give 12800 notes over 400 bars, more than the 1024 notes a figure round may hold'
			],
			[
				{ params: { ...(rhythm.params as object), cycleBars: 400_000 } },
				'figures ("eighths") does not compile at exercise level -1: round.length spans 400000 bars, more than the 1024 a round may span'
			],
			[
				{
					params: { ...(rhythm.params as object), cycleBars: 50_000_000 },
					round: {
						...(rhythm.round as object),
						expectations: [
							{
								...(rhythm.round as { expectations: object[] }).expectations[0],
								at: { bars: 49_999_996 }
							}
						]
					}
				},
				'figures ("eighths") does not compile at exercise level -1: round.length spans 50000000 bars, more than the 1024 a round may span'
			]
		];
		for (const [written, reason] of cases) {
			const { ms, refusals } = timedLoad({ ...rhythm, ...written });
			expect(refusals.map((refusal) => refusal.reason)).toEqual([reason]);
			expect(ms, reason).toBeLessThan(REFUSED_MS);
		}

		// Played without a load in between, the compiler refuses as fast.
		const played = {
			...RHYTHM_SILENT_BARS,
			params: { ...RHYTHM_SILENT_BARS.params, cycleBars: 50_000_000 }
		};
		const [served] = figureItemsAt(played, 1, METER_4_4)!;
		const start = performance.now();
		expect(() =>
			compileRound(
				played,
				{
					exerciseId: played.id,
					skill: played.practices,
					exerciseLevel: 1,
					item: served.item,
					phase: 'free',
					temperature: 'hot',
					aid: 'none',
					leadBeats: null
				},
				METER_4_4,
				{ previewBeats: 0, fromRunStart: null }
			)
		).toThrow(RoundCompileError);
		expect(performance.now() - start).toBeLessThan(50);
	});

	it('loads a long figure read one bar at a time by its listed items, each round of one bar', () => {
		// 70 bars of sixteenths (1 120 notes) as the figure of one-bar items: each round 16 notes.
		const arpeggio = arpeggioJson('h-long-short');
		const keys = (ARPEGGIO_EXERCISE.items as readonly { item: string }[]).map(
			(entry) => entry.item
		);
		const theme = Array.from({ length: 70 }, () => 'c16 '.repeat(16)).join(' | ');
		const loaded = timedLoad({
			...arpeggio,
			items: Array.from({ length: 8 }, (_, i) => ({ item: keys[i % keys.length], beats: 4 })),
			figures: [{ id: 'theme', lilypond: theme }],
			params: { ...(arpeggio.params as object), figure: 'theme' },
			levels: [{ params: { figure: 'theme' } }]
		});
		expect(loaded.refusals).toEqual([]);
		const definition = exerciseById('h-long-short');
		const plan = compileRound(
			definition,
			{
				exerciseId: definition.id,
				skill: definition.practices,
				exerciseLevel: 0,
				item: { ...placedVoicingSet.parseItem(keys[0]), beats: 4 },
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: null
			},
			METER_4_4,
			{ previewBeats: 0, fromRunStart: null }
		);
		expect(plan.expectations).toHaveLength(16);
	});

	it('loads, compiles and judges a whole theme of about 600 notes as one figure', () => {
		const rhythm = rhythmJson('h-theme');
		const bars = 38;
		const theme = Array.from({ length: bars }, () => 'c16 c c c c c c c c c c c c c c c').join(
			' | '
		);
		const loaded = timedLoad({
			...rhythm,
			params: { ...(rhythm.params as object), cycleBars: bars },
			figures: [{ id: 'theme', lilypond: theme }]
		});
		expect(loaded.refusals).toEqual([]);
		const definition = exerciseById('h-theme');
		const [served] = figureItemsAt(definition, 1, METER_4_4)!;
		const plan = compileRound(
			definition,
			{
				exerciseId: definition.id,
				skill: definition.practices,
				exerciseLevel: 1,
				item: served.item,
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: null
			},
			METER_4_4,
			{ previewBeats: 0, fromRunStart: null }
		);
		expect(plan.expectations).toHaveLength(bars * 16);
		// Judged with an attack on each note: every one paired.
		const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 80, unit: Fraction.of(1, 4) }]);
		const timed = timeExpectations(plan, map, Fraction.ZERO);
		const start = performance.now();
		const alignment = alignAttacks(
			timed,
			timed.map((e) => e.time),
			alignContext(plan, map, Fraction.ZERO)
		);
		// Measured 0.35 to 0.48 s here (Apple M3 Pro): a tripwire at about three times that.
		expect(performance.now() - start).toBeLessThan(1_500);
		expect(alignment.pairs).toHaveLength(bars * 16);
		expect(alignment.missed).toEqual([]);
	});

	it('refuses in the budget’s words two figure entries that together pass what the budget leaves', () => {
		// Two entries of 304 notes (a bar of eighths over 38 bars) with 400 left: the second
		// entry's notes alone do not pass it.
		const [entry] = RHYTHM_SILENT_BARS.round!.expectations;
		const exercise = {
			...RHYTHM_SILENT_BARS,
			params: { ...RHYTHM_SILENT_BARS.params, cycleBars: 38 },
			round: { ...RHYTHM_SILENT_BARS.round!, expectations: [entry, { ...entry }] }
		};
		const budget = new CheckBudget(levelsCheckCost(exercise) + roundCheckCost(exercise) + 400);
		expect(validateExercise(exercise, { budget })).toMatch(
			/^rhythm-silent-bars: this file asks more checking than a start can afford \(cost \d+, at most \d+\)$/
		);
		expect(budget.refusal).not.toBeNull();
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
