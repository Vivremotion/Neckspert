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
 * Whether a passage passed: a share of its changes right and in time of at least its exercise's
 * `passes`. An exercise no loaded file defines leaves its threshold unknown (an attempt keeps no
 * threshold): 1 then, the format's default, so such a passage passes only when all its changes did.
 */
function passagePassed(exerciseId: ExerciseId, attempts: readonly Attempt[]): boolean {
	if (attempts.length === 0) return false;
	const passes = findExercise(exerciseId)?.passages?.passes ?? 1;
	return attempts.filter((attempt) => attempt.success).length / attempts.length >= passes;
}

/**
 * A session by exercise and scope (spec 2026-11-18, § 8), whatever its exercises, a file defining
 * them or not: a line per exercise and scope with a round played (and the exercise played alone,
 * `alone`, even without one), in the order first met (its executions, then its attempts). Each
 * line: its rounds and those passed, the passed ones aided beyond their level (`aided`), its level
 * (`level`, when the caller knows it), the tempo of its first round (its execution's, else its
 * first round's) and of its last, its passages when its rounds were played in passages (a change
 * stored before the passages grouped by the passage it kept; a round outside a passage of such a
 * line is not counted), and whether it left the session (`left`, the trace's).
 */
export function summarizePlayed(input: {
	executions: readonly Execution[];
	attempts: readonly Attempt[];
	/** A round had an aid beyond its level's own. */
	aided(attempt: Attempt): boolean;
	/** The exercise the session played alone: its line is kept with no round. */
	alone?: ExerciseId;
	/** The level a line held at the end; null (the default) when it is not told. */
	level?(played: Played): PlayedExercise['level'];
	/** The exercises and scopes that changed air and left, as the session's trace keeps them. */
	left?: readonly Played[];
}): PlayedExercise[] {
	const order = new Map<string, Played>();
	const meet = ({ exerciseId, scope }: Played) => {
		const played = { exerciseId, ...(scope !== undefined && scope !== '' && { scope }) };
		if (!order.has(keyOf(played))) order.set(keyOf(played), played);
	};
	input.executions.forEach(meet);
	input.attempts.forEach(meet);
	if (input.alone !== undefined) meet({ exerciseId: input.alone });
	const left = new Set(
		(input.left ?? []).map((played) => keyOf({ ...played, scope: played.scope || undefined }))
	);

	return [...order.values()].flatMap((played) => {
		const key = keyOf(played);
		const own = input.attempts.filter((attempt) => keyOf(attempt) === key);
		const changes = own.filter(isChange);
		const rounds = changes.length > 0 ? changes : own;
		if (rounds.length === 0 && played.exerciseId !== input.alone) return [];
		const execution = input.executions.find((each) => keyOf(each) === key);
		const first = execution
			? execution.tempoBpm
			: (rounds.find((attempt) => attempt.tempoBpm !== null)?.tempoBpm ?? null);
		const last = rounds.at(-1)?.tempoBpm ?? first;
		let passages: PlayedExercise['passages'] = null;
		if (changes.length > 0) {
			const byPassage = new Map<string, Attempt[]>();
			for (const attempt of changes) {
				const id = passageIdOf(attempt);
				byPassage.set(id, [...(byPassage.get(id) ?? []), attempt]);
			}
			passages = {
				played: byPassage.size,
				passed: [...byPassage.values()].filter((each) => passagePassed(played.exerciseId, each))
					.length
			};
		}
		const passed = rounds.filter((attempt) => attempt.success);
		return [
			{
				...played,
				rounds: rounds.length,
				passed: passed.length,
				aided: passed.filter((attempt) => input.aided(attempt)).length,
				level: input.level?.(played) ?? null,
				tempo: first === null || last === null ? null : { first, last },
				passages,
				changedAir: left.has(key)
			}
		];
	});
}
