/**
 * What checking a definition file may cost at a start: the rounds its exercises' checks compile,
 * each weighed by what its template writes. The count limits of an exercise (`MAX_ROUND_CHECKS`,
 * `MAX_PASSAGE_ROUND_CHECKS`) bound one exercise; this bounds a file, whatever it holds.
 */
import type { RoundTemplate } from './round/types';
import type { ExerciseDefinition } from './types';

/**
 * The cost a file's checks may reach: its levels resolved (`levelsCheckCost`), each round compiled
 * (`roundCheckCost`), the notes of a figure (bounded before they are expanded). Measured on an
 * Apple M3 Pro: a unit costs 0.6 µs (rounds of the most filters) to about 3 µs (rounds of one
 * expectation and no filter on a grid of 256 changes, or levels of many params); the slowest file
 * accepted, ten such grid exercises, loads in about 0.85 s, and a catalog file costs at most 2 616.
 */
export const MAX_FILE_CHECK_COST = 300_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The number of entries a template writes as a list; 0 when it writes none. */
const listLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/**
 * What compiling one round of `round` costs, read from the template without compiling it: 1, plus
 * each expectation it writes, plus the filters (`where`) of each expectation's selection. A figure
 * entry counts as one expectation here: the notes it expands to depend on the round's length,
 * which an item or a level may give, so they are charged once compiled (`compiledExtra`).
 */
export function roundCheckWeight(round: RoundTemplate | undefined): number {
	const expectations: unknown[] = Array.isArray(round?.expectations) ? round.expectations : [];
	let weight = 1;
	for (const expectation of expectations) {
		weight += 1;
		const content = isRecord(expectation) ? expectation.content : undefined;
		if (isRecord(content) && 'family' in content) weight += listLength(content.where);
	}
	return weight;
}

/**
 * The param entries one unit of check cost stands for, where a check resolves params (a level's
 * over the exercise's, a ladder level's over both) or a round copies them: about 0.15 to 0.2 µs
 * an entry measured, so a unit costs about what a weight unit of a round does.
 */
export const PARAM_ENTRIES_PER_UNIT = 16;

const units = (entries: number) => Math.ceil(entries / PARAM_ENTRIES_PER_UNIT);

/** The number of entries a level writes in its params; 0 when it writes none. */
const paramCount = (level: unknown): number =>
	isRecord(level) && isRecord(level.params) ? Object.keys(level.params).length : 0;

/**
 * What the levels of an exercise write, as counted before any is read: the entries of its own
 * params (with the four the engine adds: tempo, windows, pacing, direct recall), those each
 * exercise level writes (one level writing none when it writes no levels), those each ladder
 * level writes.
 */
function levelShape(definition: ExerciseDefinition) {
	const params: unknown = definition.params;
	const base = (isRecord(params) ? Object.keys(params).length : 0) + 4;
	const written: unknown = definition.levels;
	const levels = Array.isArray(written) && written.length > 0 ? written.map(paramCount) : [0];
	const ladder: unknown = isRecord(params) ? params.ladder : undefined;
	return { base, levels, ladder: Array.isArray(ladder) ? ladder.map(paramCount) : [] };
}

/**
 * What resolving the params of the exercise's levels costs, counted before the work: the level
 * checks resolve each exercise level, then each ladder level over each of them; a sweep of the
 * params its selections read resolves each exercise level again, reads the ladder's keys and
 * visits each pair. Charged once per pass that checks the exercise.
 */
export function levelsCheckCost(definition: ExerciseDefinition): number {
	const { base, levels, ladder } = levelShape(definition);
	const exercise = levels.reduce((sum, written) => sum + base + written, 0);
	const ladderEntries = ladder.reduce((sum, written) => sum + written, 0);
	const checks = exercise + ladder.length * exercise + levels.length * ladderEntries;
	const sweep = exercise + ladderEntries + levels.length * ladder.length;
	return units(checks + sweep);
}

/**
 * What compiling one round of the exercise costs, read before compiling it: its template's weight
 * (`roundCheckWeight`) plus the params a round reads, as many as its most written exercise level
 * and its ladder's first level give.
 */
export function roundCheckCost(definition: ExerciseDefinition): number {
	const { base, levels, ladder } = levelShape(definition);
	return roundCheckWeight(definition.round) + units(base + Math.max(...levels) + (ladder[0] ?? 0));
}

/** The expectations a compiled round holds beyond those its template writes (a figure's notes). */
export function compiledExtra(round: RoundTemplate | undefined, compiled: number): number {
	const written = listLength(round?.expectations);
	return Math.max(0, compiled - written);
}

/** Thrown by `CheckBudget.charge` once a file's checks would cost more than they may. */
export class CheckBudgetExceeded extends Error {
	constructor(
		readonly cost: number,
		readonly max: number
	) {
		super(`this file asks more checking than a start can afford (cost ${cost}, at most ${max})`);
		this.name = 'CheckBudgetExceeded';
	}
}

/**
 * The cost spent checking one file, charged before each round its checks compile (and after, for
 * the notes a figure expands to). Once over, it stays over: the file's later exercises are refused
 * with the same words (`refusal`).
 */
export class CheckBudget {
	private spentCost = 0;
	private over: CheckBudgetExceeded | null = null;

	constructor(readonly max: number = MAX_FILE_CHECK_COST) {}

	get spent(): number {
		return this.spentCost;
	}

	/** What may still be charged. */
	get left(): number {
		return this.max - this.spentCost;
	}

	/** Why nothing more of the file is checked; null while the budget holds. */
	get refusal(): string | null {
		return this.over?.message ?? null;
	}

	/** Adds `cost`; throws `CheckBudgetExceeded` when the total passes the budget. */
	charge(cost: number): void {
		if (this.over) throw this.over;
		const total = this.spentCost + cost;
		if (total > this.max) {
			this.over = new CheckBudgetExceeded(total, this.max);
			throw this.over;
		}
		this.spentCost = total;
	}
}
