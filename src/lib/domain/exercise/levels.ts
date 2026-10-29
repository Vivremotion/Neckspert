import { levelRange, type Level } from '../time/levels';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';
import { recallThresholdOf } from './recall';
import { DEFAULT_TEMPO_BPM } from './tempo';
import type { ExerciseDefinition, ExercisePacing, MechanicId } from './types';
import { windowsOf } from './windows';

/** Dotted paths of the resolved params and the values that replace them. */
export type LevelOverrides = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The params with the value at each dotted path replaced, nothing else: an object written at a
 * path replaces the one there whole, a missing path is created. The params are not modified.
 * Throws, naming the path, when a path runs through a value that is not an object.
 */
export function overrideParams(
	params: Readonly<Record<string, unknown>>,
	overrides: LevelOverrides
): Readonly<Record<string, unknown>> {
	const result: Record<string, unknown> = { ...params };
	for (const [path, value] of Object.entries(overrides)) {
		const keys = path.split('.');
		let at = result;
		for (const [depth, key] of keys.slice(0, -1).entries()) {
			const next = at[key];
			if (next === undefined) {
				at[key] = {};
			} else if (isRecord(next)) {
				// Copied on the way down: the params given and their nested objects stay as they are.
				at[key] = { ...next };
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

/**
 * The params the exercise alone gives: its own, its windows, pacing and recall threshold over
 * their defaults, and its `tempo` (the one it writes, else `DEFAULT_TEMPO_BPM`).
 */
export function exerciseParamsOf(
	definition: ExerciseDefinition
): Readonly<Record<string, unknown>> {
	return {
		...definition.params,
		// One source of the tempo: the definition's, never a `tempo` of its params.
		tempo: definition.tempo ?? DEFAULT_TEMPO_BPM,
		windows: windowsOf(definition),
		pacing: pacingOf(definition),
		recallThresholdMs: recallThresholdOf(definition)
	};
}

/**
 * Exercise params (`exerciseParamsOf`, with `tempo`), then the exercise level, then the item
 * level (on the ladder the exercise writes for `mechanic`), each overriding the one before.
 */
export function resolvedParamsOf(
	definition: ExerciseDefinition,
	at: { exerciseLevel: number; itemLevel: number | null; mechanic?: MechanicId }
): Readonly<Record<string, unknown>> {
	const exerciseLevel = levelAt(exerciseLevelsOf(definition), at.exerciseLevel, definition.id);
	const params = overrideParams(exerciseParamsOf(definition), exerciseLevel.params);
	if (at.itemLevel === null) return params;
	const ladder = ladderOf(definition, at.mechanic);
	const itemLevel = levelAt(ladder, at.itemLevel, `${definition.id} item`);
	return overrideParams(params, itemLevel.params as LevelOverrides);
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
