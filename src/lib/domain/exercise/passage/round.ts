import type { PlannedItem, PlannedPassage } from '../../types';
import { RoundCompileError } from '../round/compile';
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
