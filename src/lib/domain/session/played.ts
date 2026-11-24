import { findExercise } from '$lib/domain/exercise/registry';
import type { Attempt, Execution, ExerciseId, PlayedExercise } from '$lib/domain/types';
import { isChange, passageIdOf } from './misses';

/** An exercise and scope, as a line of the summary is keyed. */
interface Played {
	exerciseId: ExerciseId;
	scope?: string;
}

const keyOf = ({ exerciseId, scope }: Played) => `${exerciseId}\u0000${scope ?? ''}`;

/**
 * Whether a passage passed: a share of its changes right and in time of at least `passes`, its
 * exercise's threshold.
 */
function passagePassed(passes: number, attempts: readonly Attempt[]): boolean {
	if (attempts.length === 0) return false;
	return attempts.filter((attempt) => attempt.success).length / attempts.length >= passes;
}

/**
 * A session by exercise and scope (spec 2026-11-18, § 8), whatever its exercises, a file defining
 * them or not: a line per exercise and scope with a round played (and the exercise played alone,
 * `alone`, without one when its level is told), in the order first met (its executions, then its
 * attempts). Each line: its rounds and those passed, its level (`level`, when the caller knows
 * it), the tempo of its first round (its execution's, else its first round's) and of its last,
 * whether its rounds were played in passages (`inPassages`: a round outside a passage of such a
 * line is not counted) and its passages played and passed when a file still defines its
 * exercise's threshold (a change stored before the passages grouped by the passage it kept).
 */
export function summarizePlayed(input: {
	executions: readonly Execution[];
	attempts: readonly Attempt[];
	/** The exercise the session played alone: its line is kept with no round when its level is told. */
	alone?: ExerciseId;
	/** The level a line held at the end; null (the default) when it is not told. */
	level?(played: Played): PlayedExercise['level'];
}): PlayedExercise[] {
	const order = new Map<string, Played>();
	const meet = ({ exerciseId, scope }: Played) => {
		const played = { exerciseId, ...(scope !== undefined && scope !== '' && { scope }) };
		if (!order.has(keyOf(played))) order.set(keyOf(played), played);
	};
	input.executions.forEach(meet);
	input.attempts.forEach(meet);
	if (input.alone !== undefined) meet({ exerciseId: input.alone });

	return [...order.values()].flatMap((played) => {
		const key = keyOf(played);
		const own = input.attempts.filter((attempt) => keyOf(attempt) === key);
		const changes = own.filter(isChange);
		const rounds = changes.length > 0 ? changes : own;
		const level = input.level?.(played) ?? null;
		if (rounds.length === 0 && !(played.exerciseId === input.alone && level !== null)) return [];
		const execution = input.executions.find((each) => keyOf(each) === key);
		const first = execution
			? execution.tempoBpm
			: (rounds.find((attempt) => attempt.tempoBpm !== null)?.tempoBpm ?? null);
		const last = rounds.at(-1)?.tempoBpm ?? first;
		// An exercise no file defines leaves its threshold unknown (an attempt keeps none): its
		// passages are not counted. One a file defines passes at its `passes`, else the format's 1.
		const definition = findExercise(played.exerciseId);
		const passes = definition ? (definition.passages?.passes ?? 1) : undefined;
		let passages: PlayedExercise['passages'] = null;
		if (changes.length > 0 && passes !== undefined) {
			const byPassage = new Map<string, Attempt[]>();
			for (const attempt of changes) {
				const id = passageIdOf(attempt);
				byPassage.set(id, [...(byPassage.get(id) ?? []), attempt]);
			}
			passages = {
				played: byPassage.size,
				passed: [...byPassage.values()].filter((each) => passagePassed(passes, each)).length
			};
		}
		const passed = rounds.filter((attempt) => attempt.success);
		return [
			{
				...played,
				rounds: rounds.length,
				passed: passed.length,
				level,
				tempo: first === null || last === null ? null : { first, last },
				inPassages: changes.length > 0,
				passages
			}
		];
	});
}
