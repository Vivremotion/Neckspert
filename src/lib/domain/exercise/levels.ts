import { hasSkill, skillById } from '../skill/registry';
import { levelRange, type Level } from '../time/levels';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';
import { DEFAULT_TEMPO_BPM } from './tempo';
import type { ExerciseDefinition, ExercisePacing, PromptPresentation } from './types';
import { windowsOf } from './windows';

/** Dotted paths of the resolved params and the values that replace them. */
export type LevelOverrides = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Why overrides cannot be applied whatever the params: a path written with no value, or a path
 * written with one of its sub-paths (which of the two wins would depend on their order).
 */
function overridesProblem(overrides: LevelOverrides): string | null {
	const paths = Object.keys(overrides);
	// Each path's first sub-path in the order written, found from the sub-paths' dotted prefixes:
	// linear in the length of the paths, so a level writing many paths is checked fast.
	const firstSub = new Map<string, string>();
	for (const path of paths) {
		for (let dot = path.indexOf('.'); dot !== -1; dot = path.indexOf('.', dot + 1)) {
			const prefix = path.slice(0, dot);
			if (!firstSub.has(prefix)) firstSub.set(prefix, path);
		}
	}
	for (const path of paths) {
		if (overrides[path] === undefined) {
			return `writes a path with no value: "${path}" is undefined`;
		}
		const sub = firstSub.get(path);
		if (sub !== undefined) return `writes "${path}" and its sub-path "${sub}"`;
	}
	return null;
}

/**
 * The params with the value at each dotted path replaced, nothing else: an object written at a
 * path replaces the one there whole, a missing path is created. The params are not modified.
 * Throws, naming the path, when a path runs through a value that is not an object, is written
 * with no value, or is written with one of its sub-paths.
 */
export function overrideParams(
	params: Readonly<Record<string, unknown>>,
	overrides: LevelOverrides
): Readonly<Record<string, unknown>> {
	const problem = overridesProblem(overrides);
	if (problem !== null) throw new Error(problem);
	const result: Record<string, unknown> = { ...params };
	// The objects this call made or copied: each copied once, however many paths run through it.
	const own = new WeakSet<object>([result]);
	for (const [path, value] of Object.entries(overrides)) {
		const keys = path.split('.');
		let at = result;
		for (const [depth, key] of keys.slice(0, -1).entries()) {
			const next = at[key];
			if (next === undefined) {
				at[key] = {};
				own.add(at[key] as object);
			} else if (isRecord(next)) {
				// Copied on the way down: the params given and their nested objects stay as they are.
				if (!own.has(next)) {
					at[key] = { ...next };
					own.add(at[key] as object);
				}
			} else {
				throw new Error(
					`the path ${path} runs through ${keys.slice(0, depth + 1).join('.')}, which is not an object`
				);
			}
			at = at[key] as Record<string, unknown>;
		}
		at[keys[keys.length - 1]] = value;
	}
	return result;
}

/** The level an exercise writing none has: it changes nothing. */
const IMPLICIT_LEVELS: readonly Level<LevelOverrides>[] = [{ params: {} }];

/** The exercise's levels; one implicit level `{ params: {} }` when it writes none. */
export function exerciseLevelsOf(definition: ExerciseDefinition): readonly Level<LevelOverrides>[] {
	return definition.levels && definition.levels.length > 0 ? definition.levels : IMPLICIT_LEVELS;
}

/** Level `index` of `levels` (0 = level 1, aid levels negative); throws outside them. */
function levelAt<P>(levels: readonly Level<P>[], index: number, what: string): Level<P> {
	const { lowest, highest } = levelRange(levels);
	if (!Number.isInteger(index) || index < lowest || index > highest) {
		throw new RangeError(`${what} level ${index} is not in ${lowest}..${highest}`);
	}
	return levels[index - lowest];
}

/** The direct recall of the skill the exercise practises; none when it writes none or is unregistered. */
function directRecallParamsOf(definition: ExerciseDefinition): {
	directRecall?: { withinMs: number };
} {
	if (!hasSkill(definition.practices)) return {};
	const { directRecall } = skillById(definition.practices);
	return directRecall === undefined ? {} : { directRecall: { ...directRecall } };
}

/**
 * The params the exercise alone gives: its own, its windows and pacing over their defaults, its
 * `tempo` (the one it writes, else `DEFAULT_TEMPO_BPM`), its `presentation` when it writes one, and
 * the `directRecall` its skill writes.
 */
export function exerciseParamsOf(
	definition: ExerciseDefinition
): Readonly<Record<string, unknown>> {
	// One source of the presentation: the definition's, never a `presentation` of its params.
	const { presentation: _unread, ...own } = definition.params;
	return {
		...own,
		// One source of the tempo: the definition's, never a `tempo` of its params.
		tempo: definition.tempo ?? DEFAULT_TEMPO_BPM,
		windows: windowsOf(definition),
		pacing: pacingOf(definition),
		...(definition.presentation !== undefined && { presentation: definition.presentation }),
		...directRecallParamsOf(definition)
	};
}

/**
 * Exercise params (`exerciseParamsOf`, with `tempo`), then the exercise level, then the item
 * level (on the ladder the exercise writes), each overriding the one before.
 */
export function resolvedParamsOf(
	definition: ExerciseDefinition,
	at: { exerciseLevel: number; itemLevel: number | null }
): Readonly<Record<string, unknown>> {
	const exerciseLevel = levelAt(exerciseLevelsOf(definition), at.exerciseLevel, definition.id);
	const params = overrideParams(exerciseParamsOf(definition), exerciseLevel.params);
	if (at.itemLevel === null) return params;
	const ladder = ladderOf(definition);
	const itemLevel = levelAt(ladder, at.itemLevel, `${definition.id} item`);
	return overrideParams(params, itemLevel.params as LevelOverrides);
}

/** The key of the presentation in the resolved params (`exerciseParamsOf`). */
const PRESENTATION = 'presentation';

/** Whether a dotted path writes the presentation or a slot of it (`presentation.*`). */
export function isPresentationPath(path: string): boolean {
	return path === PRESENTATION || path.startsWith(`${PRESENTATION}.`);
}

/** The paths of `overrides` that write the presentation (`isPresentationPath`). */
function presentationOverrides(overrides: LevelOverrides): LevelOverrides {
	return Object.fromEntries(Object.entries(overrides).filter(([path]) => isPresentationPath(path)));
}

/**
 * What the screen says of a prompt at a level: the exercise's `presentation`, then the
 * `presentation.*` paths of its exercise level, then those of its item level, each replacing what
 * it writes; undefined when the exercise writes none. The `presentation` of `resolvedParamsOf`,
 * resolved over the presentation alone, so a prompt does not copy the other params.
 */
export function presentationOf(
	definition: ExerciseDefinition,
	at: { exerciseLevel: number; itemLevel: number | null }
): PromptPresentation | undefined {
	if (definition.presentation === undefined) return undefined;
	const exerciseLevel = levelAt(exerciseLevelsOf(definition), at.exerciseLevel, definition.id);
	let params = overrideParams(
		{ [PRESENTATION]: definition.presentation },
		presentationOverrides(exerciseLevel.params)
	);
	if (at.itemLevel !== null) {
		const itemLevel = levelAt(ladderOf(definition), at.itemLevel, `${definition.id} item`);
		params = overrideParams(params, presentationOverrides(itemLevel.params as LevelOverrides));
	}
	return params[PRESENTATION] as PromptPresentation;
}

/** The tempo an exercise level plays at. */
export function tempoOf(definition: ExerciseDefinition, exerciseLevel: number): number {
	const { tempo } = resolvedParamsOf(definition, { exerciseLevel, itemLevel: null });
	if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo <= 0) {
		throw new Error(`${definition.id}: level ${exerciseLevel} resolves no tempo, got ${tempo}`);
	}
	return tempo;
}

/** The pacing an exercise level plays at: its runs and breaths (`pacing`, over its default). */
export function pacingAt(definition: ExerciseDefinition, exerciseLevel: number): ExercisePacing {
	return resolvedParamsOf(definition, { exerciseLevel, itemLevel: null }).pacing as ExercisePacing;
}
