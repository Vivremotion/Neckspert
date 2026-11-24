/**
 * What checking a definition file may cost at a start: the rounds its exercises' checks compile,
 * each weighed by what its template writes. The count limits of an exercise (`MAX_ROUND_CHECKS`,
 * `MAX_PASSAGE_ROUND_CHECKS`) bound one exercise; this bounds a file, whatever it holds.
 */
import type { RoundTemplate } from './round/types';
import { exerciseParamsOf, isPresentationPath } from './levels';
import type { ExerciseDefinition } from './types';

/**
 * The cost a file's checks may reach: its levels resolved (`levelsCheckCost`), each round compiled
 * (`roundCheckCost`), the notes of a figure (bounded before they are expanded). Measured on an
 * Apple M3 Pro: a unit costs 0.6 µs (rounds of the most filters) to about 3 µs (rounds of one
 * expectation and no filter on a grid of 256 changes, or levels of many params); the slowest file
 * accepted, ten such grid exercises, loads in about 0.85 s, and a catalog file costs at most 2 684
 * (`catalog/changes.json`, under 1 % of the budget).
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

/**
 * The entries of a value at every depth, an object's keys and a list's elements and all they hold
 * (1 for a value that holds nothing); counted once a value however often it is asked (`seen`),
 * without recursion, so a deep value cannot overflow.
 */
function nestedSize(value: unknown, seen: WeakMap<object, number>): number {
	if (typeof value !== 'object' || value === null) return 1;
	const known = seen.get(value);
	if (known !== undefined) return known;
	let size = 0;
	const stack: unknown[] = [value];
	while (stack.length > 0) {
		const at = stack.pop();
		if (typeof at !== 'object' || at === null) continue;
		const parts = Array.isArray(at) ? at : Object.values(at);
		size += parts.length;
		for (const part of parts) if (typeof part === 'object' && part !== null) stack.push(part);
	}
	seen.set(value, Math.max(1, size));
	return Math.max(1, size);
}

/**
 * What a level writes, as its resolutions may copy it (`overrideParams`), an upper bound:
 * `count` its paths; `written` each value it writes at its nested size; `writes`, by the first key
 * of each path, what it writes under that key; `entered`, the first keys of its dotted paths,
 * under each of which a resolution may copy the whole of what lies there.
 */
interface LevelWrites {
	count: number;
	written: number;
	writes: Map<string, number>;
	entered: Set<string>;
}

function writesOf(
	level: unknown,
	seen: WeakMap<object, number>,
	keep: (path: string) => boolean = () => true
): LevelWrites {
	const shape: LevelWrites = { count: 0, written: 0, writes: new Map(), entered: new Set() };
	const params = isRecord(level) ? level.params : undefined;
	if (!isRecord(params)) return shape;
	for (const [path, value] of Object.entries(params)) {
		if (!keep(path)) continue;
		const size = nestedSize(value, seen);
		const [first, ...rest] = path.split('.');
		shape.count += 1;
		shape.written += size;
		shape.writes.set(first, (shape.writes.get(first) ?? 0) + size);
		if (rest.length > 0) shape.entered.add(first);
	}
	return shape;
}

/** Whether writing `key` may change the value at `path`: the same path, one above or one below it. */
const touches = (key: string, path: string) =>
	key === path || key.startsWith(`${path}.`) || path.startsWith(`${key}.`);

/**
 * The paths of the params the selections of an exercise read (`{ param }` in a round's selection
 * contents and in its passages' members), which a sweep of its levels resolves.
 */
function selectionPaths(definition: ExerciseDefinition): string[] {
	const paths: string[] = [];
	const stack: unknown[] = [];
	const expectations: unknown = definition.round?.expectations;
	if (Array.isArray(expectations)) {
		for (const expectation of expectations) {
			const content = isRecord(expectation) ? expectation.content : undefined;
			if (isRecord(content) && 'family' in content) stack.push(content);
		}
	}
	const passages: unknown = definition.passages;
	if (isRecord(passages)) stack.push(passages.members);
	return paramPaths(stack);
}

/**
 * The paths of the params the member asked reads (`params.learning.asks`), which its own check
 * sweeps apart from the round's (`definitionChecks`).
 */
function askedPaths(definition: ExerciseDefinition): string[] {
	const params: unknown = definition.params;
	const learning = isRecord(params) ? params.learning : undefined;
	return paramPaths([isRecord(learning) ? learning.asks : undefined]);
}

/** The paths of every `{ param }` under `stack`. */
function paramPaths(stack: unknown[]): string[] {
	const paths: string[] = [];
	while (stack.length > 0) {
		const at = stack.pop();
		if (Array.isArray(at)) stack.push(...at);
		else if (isRecord(at)) {
			if (typeof at.param === 'string') paths.push(at.param);
			stack.push(...Object.values(at));
		}
	}
	return paths;
}

/**
 * What the levels of an exercise may copy, as counted before any is resolved: `top`, the entries
 * of its own params as the engine resolves them (with the four it adds: tempo, windows, pacing,
 * direct recall); `under(key)`, the nested size of what its params hold under a key; what each
 * exercise level and each ladder level writes (`writesOf`; one level writing nothing when it
 * writes no levels).
 */
function levelShape(definition: ExerciseDefinition) {
	const params: unknown = definition.params;
	let own: Readonly<Record<string, unknown>> = isRecord(params) ? params : {};
	try {
		own = exerciseParamsOf(definition);
	} catch {
		// What cannot be resolved is refused by its own check; counted on what is written.
	}
	const seen = new WeakMap<object, number>();
	const under = (key: string) => (Object.hasOwn(own, key) ? nestedSize(own[key], seen) : 0);
	const written: unknown = definition.levels;
	const levels =
		Array.isArray(written) && written.length > 0
			? written.map((level) => writesOf(level, seen))
			: [writesOf(undefined, seen)];
	const ladder: unknown = isRecord(params) ? params.ladder : undefined;
	const read = selectionPaths(definition);
	const swept = (path: string) => read.some((at) => touches(path, at));
	const asked = askedPaths(definition);
	const sweptAsked = (path: string) => asked.some((at) => touches(path, at));
	const steps = Array.isArray(ladder) ? ladder : [];
	const presentation: unknown = definition.presentation;
	return {
		top: Object.keys(own).length + 4,
		under,
		levels,
		// What the presentation checks resolve: the presentation and the paths each level writes in it.
		presentation: presentation === undefined ? null : nestedSize(presentation, seen),
		presentationLevels: (Array.isArray(written) ? written : []).map((level) =>
			writesOf(level, seen, isPresentationPath)
		),
		presentationLadder: steps.map((level) => writesOf(level, seen, isPresentationPath)),
		ladder: steps.map((level) => writesOf(level, seen)),
		// What a sweep lays of each ladder level: the paths a selection reads, nothing else.
		sweptLadder: steps.map((level) => writesOf(level, seen, swept)),
		// The member asked's own sweep, when it reads a param.
		askedLadder: asked.length > 0 ? steps.map((level) => writesOf(level, seen, sweptAsked)) : null
	};
}

/**
 * What resolving `level` over the exercise's params may copy, an upper bound: their top level,
 * what it writes at its nested size, and under each key a dotted path of it enters, the whole of
 * what the params hold there and what the level under it writes there (`below`; none for an
 * exercise level).
 */
function resolutionCost(
	top: number,
	under: (key: string) => number,
	level: LevelWrites,
	below: LevelWrites | null
): number {
	let copied = top + (below?.count ?? 0) + level.written;
	for (const key of level.entered) copied += under(key) + (below?.writes.get(key) ?? 0);
	return copied;
}

/**
 * What checking the presentation at its levels costs (`presentationProblem`), an upper bound: the
 * presentation resolved and checked at each exercise level that rewrites it, and at each ladder
 * level that rewrites it over each exercise level, each time its entries and the paths written in
 * it; nothing for an exercise without a presentation.
 */
function presentationEntries(shape: ReturnType<typeof levelShape>): number {
	const { presentation, presentationLevels, presentationLadder, levels } = shape;
	if (presentation === null) return 0;
	let entries = 0;
	for (const level of presentationLevels) {
		if (level.count > 0) entries += presentation + level.written;
	}
	for (const step of presentationLadder) {
		if (step.count === 0) continue;
		for (let i = 0; i < levels.length; i++) {
			entries += presentation + step.written + (presentationLevels[i]?.written ?? 0);
		}
	}
	return entries;
}

/**
 * What resolving the params of the exercise's levels costs, counted before the work, an upper
 * bound (`resolutionCost` for each resolution): the level checks resolve each exercise level, then
 * each ladder level over each of them; a sweep of the params its selections read resolves each
 * exercise level again and lays over each the paths of each ladder level they read
 * (`selectionPaths`), and the member asked (`params.learning.asks`), when it reads a param,
 * sweeps its own the same way (`askedPaths`); the items' rounds resolve each exercise level once
 * more, at the ladder's first level; the presentation is checked at the levels that rewrite it
 * (`presentationEntries`). Charged once per pass that checks the exercise.
 */
export function levelsCheckCost(definition: ExerciseDefinition): number {
	const shape = levelShape(definition);
	const { top, under, levels, ladder, sweptLadder, askedLadder } = shape;
	let exercise = 0;
	let pairs = 0;
	let swept = 0;
	let asked = 0;
	let atFirst = 0;
	// A ladder level that writes no path a sweep reads is visited, not laid.
	const laid = (step: LevelWrites, level: LevelWrites) =>
		step.count === 0 ? 1 : resolutionCost(top, under, step, level);
	for (const level of levels) {
		exercise += resolutionCost(top, under, level, null);
		for (const step of ladder) pairs += resolutionCost(top, under, step, level);
		for (const step of sweptLadder) swept += laid(step, level);
		for (const step of askedLadder ?? []) asked += laid(step, level);
		if (ladder.length > 0) atFirst += resolutionCost(top, under, ladder[0], level);
	}
	const askedSweep = askedLadder === null ? 0 : exercise + asked;
	// The level checks, a sweep, the member asked's sweep, the items' rounds, the presentation's.
	return units(
		exercise +
			pairs +
			(exercise + swept) +
			askedSweep +
			(exercise + atFirst) +
			presentationEntries(shape)
	);
}

/**
 * What compiling one round of the exercise costs, read before compiling it: its template's weight
 * (`roundCheckWeight`) plus what resolving its params may copy, as much as the most copying of
 * its exercise levels, and of its ladder's first level over each (the source, which keeps no
 * resolution, resolves them at every round; at load a round copies their top level).
 */
export function roundCheckCost(definition: ExerciseDefinition): number {
	const { top, under, levels, ladder } = levelShape(definition);
	let most = 0;
	for (const level of levels) {
		const atLevel = resolutionCost(top, under, level, null);
		const atFirst = ladder.length > 0 ? resolutionCost(top, under, ladder[0], level) : 0;
		most = Math.max(most, atLevel, atFirst);
	}
	return roundCheckWeight(definition.round) + units(most);
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
