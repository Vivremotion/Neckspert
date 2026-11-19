import type { Level } from '$lib/domain/time/levels';
import { isBeatCount } from '$lib/domain/time/meter';
import type { ExerciseDefinition, Ladder } from './types';

const positiveInteger = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;

const SUCCESSES = ['any', 'direct-recall'];

/** Null when a level's conditions can be run, else why not: its success, pass or drop. */
export function levelConditionsProblem(level: Level<unknown>): string | null {
	if (level.success !== undefined && !SUCCESSES.includes(level.success)) {
		return `the success must be one of ${SUCCESSES.join(', ')}, got ${level.success}`;
	}
	if (level.pass !== undefined && !positiveInteger(level.pass.successes)) {
		return `the pass must be a positive integer, got ${level.pass.successes}`;
	}
	if (level.drop !== undefined && !positiveInteger(level.drop.failures)) {
		return `the drop must be a positive integer, got ${level.drop.failures}`;
	}
	return null;
}

/**
 * Null when the ladder can be run, else why not: empty, a lead neither null (no lead) nor a
 * positive exact fraction of a beat, an aid not a boolean, a success neither `'any'` nor
 * `'direct-recall'`, a pass or drop not a positive integer.
 */
export function validateLadder(ladder: Ladder): string | null {
	if (!Array.isArray(ladder)) return 'is not a list of levels';
	if (ladder.length === 0) return 'is empty';
	for (const [index, level] of ladder.entries()) {
		const lead = level?.params?.leadBeats;
		if (lead !== null && !(isBeatCount(lead) && lead > 0)) {
			return `level ${index}: the lead must be null or a positive number of beats, an exact fraction of a beat, got ${lead}`;
		}
		const aided = level.params.aided as unknown;
		if (aided !== undefined && typeof aided !== 'boolean') {
			return `level ${index}: aided must be true or false, got ${aided}`;
		}
		const conditions = levelConditionsProblem(level);
		if (conditions !== null) return `level ${index}: ${conditions}`;
	}
	return null;
}

/** The ladder an exercise writes (`params.ladder`); throws when it has none. */
export function ladderOf(definition: ExerciseDefinition): Ladder {
	const written = definition.params.ladder as Ladder | undefined;
	if (written === undefined) {
		throw new Error(`${definition.id}: params.ladder is missing, the exercise writes no ladder`);
	}
	const invalid = validateLadder(written);
	if (invalid !== null) throw new Error(`${definition.id}: params.ladder ${invalid}`);
	return written;
}
