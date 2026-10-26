import { isBeatCount } from '$lib/domain/time/meter';
import type { LeadBeats } from '$lib/domain/types';
import type { ExerciseDefinition, Ladder, MechanicId } from './types';

const positiveInteger = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;

const SUCCESSES = ['any', 'direct-recall'];

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
		if (level.success !== undefined && !SUCCESSES.includes(level.success)) {
			return `level ${index}: the success must be one of ${SUCCESSES.join(', ')}, got ${level.success}`;
		}
		if (level.pass !== undefined && !positiveInteger(level.pass.successes)) {
			return `level ${index}: the pass must be a positive integer, got ${level.pass.successes}`;
		}
		if (level.drop !== undefined && !positiveInteger(level.drop.failures)) {
			return `level ${index}: the drop must be a positive integer, got ${level.drop.failures}`;
		}
	}
	return null;
}

/** Where an exercise writes the ladder of the items of `mechanic`: `params.ladder`, or `params.ladders.<mechanic>`. */
export function ladderFieldOf(definition: ExerciseDefinition, mechanic?: MechanicId): string {
	return definition.params.ladder !== undefined || mechanic === undefined
		? 'params.ladder'
		: `params.ladders.${mechanic}`;
}

/** The ladder an exercise writes for the items of `mechanic` (`params.ladder`, or `params.ladders[mechanic]` for an exercise of several mechanics); throws when it has none. */
export function ladderOf(definition: ExerciseDefinition, mechanic?: MechanicId): Ladder {
	const { ladder, ladders } = definition.params as {
		ladder?: Ladder;
		ladders?: Readonly<Record<MechanicId, Ladder>>;
	};
	const field = ladderFieldOf(definition, mechanic);
	const written = ladder ?? (mechanic === undefined ? undefined : ladders?.[mechanic]);
	if (written === undefined) {
		throw new Error(`${definition.id}: ${field} is missing, the exercise writes no ladder`);
	}
	const invalid = validateLadder(written);
	if (invalid !== null) throw new Error(`${definition.id}: ${field} ${invalid}`);
	return written;
}

/**
 * The leads of the exercise's ladder, in order, for the old triad path, which knows a level by its
 * lead: throws, naming the exercise, on a ladder without leads or with a lead twice. Until H5.
 */
export function leadStepsOf(definition: ExerciseDefinition, mechanic?: MechanicId): LeadBeats[] {
	const field = `${definition.id}: ${ladderFieldOf(definition, mechanic)}`;
	const leads: LeadBeats[] = [];
	for (const { params } of ladderOf(definition, mechanic)) {
		const lead = params.leadBeats;
		if (lead === null || lead === undefined) continue;
		if (leads.includes(lead)) throw new Error(`${field} gives the lead ${lead} twice`);
		leads.push(lead);
	}
	if (leads.length === 0) throw new Error(`${field} has no lead, the old triad path needs one`);
	return leads;
}

/** The successes at the top of the exercise's ladder that make an item learned, for the old triad path. Until H5. */
export function learnedAfterOf(definition: ExerciseDefinition, mechanic?: MechanicId): number {
	const ladder = ladderOf(definition, mechanic);
	return ladder[ladder.length - 1].pass?.successes ?? Infinity;
}
