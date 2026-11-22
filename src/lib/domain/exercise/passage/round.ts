import { METER_4_4 } from '../../time/meter';
import type { PlannedItem, PlannedPassage } from '../../types';
import type { RoundPlan } from '../../time/plan';
import { compileRound, RoundCompileError, type ResolutionCache } from '../round/compile';
import { SelectionCompileError } from '../selection/compile';
import type { ExerciseDefinition } from '../types';
import { PassageReadError } from './indices';
import type { PassageIndex } from './types';

/** Every passage param at its first value. */
export function firstEach(definition: ExerciseDefinition): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(definition.passages?.each ?? {}).map(([name, values]) => [name, values[0]])
	);
}

/** The round of a passage's member, as a source serves it, with no member heard before. */
export function passageRound(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Readonly<Record<string, unknown>>,
	item: unknown,
	rank: number,
	length: number
): PlannedItem & { passage: PlannedPassage } {
	return {
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item,
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		passage: { id: '', index: index.key, of: index.of, rank, length, each, previous: null }
	};
}

/**
 * The whole round of a passage's member compiled, in its exercise's meter, with the preview its
 * flow writes (0 without one): what the load and the source check before a passage is played;
 * `maxExpectations` bounds a figure's notes before they are expanded (`compileRound`).
 * Throws as `compileRound` does.
 */
export function compilePassageRound(
	definition: ExerciseDefinition,
	round: PlannedItem,
	cache?: ResolutionCache,
	maxExpectations?: number
): RoundPlan {
	return compileRound(definition, round, definition.meter ?? METER_4_4, {
		previewBeats: definition.flow?.previewBeats ?? 0,
		fromRunStart: null,
		...(cache && { cache }),
		...(maxExpectations !== undefined && { maxExpectations })
	});
}

/**
 * Whether an error says that a passage cannot be played from its data: its passage cannot be
 * read (`PassageReadError`), or a selection or a round cannot be compiled for its values. Any
 * other error is a bug, and goes through.
 */
export function isUnplayable(error: unknown): boolean {
	return (
		error instanceof PassageReadError ||
		error instanceof SelectionCompileError ||
		error instanceof RoundCompileError
	);
}
