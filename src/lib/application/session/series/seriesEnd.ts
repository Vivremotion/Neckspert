import { nextTempo } from '$lib/domain/exercise/tempo';
import type { Progression } from '$lib/domain/exercise/types';
import type { Attempt, Execution } from '$lib/domain/types';

/**
 * The tempo each execution moves to after a series, fitted to its own attempts (those of its
 * exercise in its scope); only the ones that move. A tempo moves only after enough attempts, so
 * `own` names the exercise's mechanic.
 */
export function nextProgressions(
	executions: readonly Execution[],
	attempts: readonly Attempt[],
	updatedAt: number
): Progression[] {
	const moved: Progression[] = [];
	for (const { exerciseId, scope, tempoBpm } of executions) {
		if (tempoBpm === null) continue;
		const own = attempts.filter(
			(attempt) =>
				attempt.exerciseId === exerciseId && (attempt.tempoScope ?? null) === (scope ?? null)
		);
		const next = nextTempo(tempoBpm, own);
		if (next === tempoBpm) continue;
		moved.push({
			exerciseId,
			...(scope !== undefined && { scope }),
			mechanic: own[0].mechanic,
			tempoBpm: next,
			updatedAt
		});
	}
	return moved;
}
