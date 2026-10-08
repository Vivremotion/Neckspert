import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';
import type { Execution, ExerciseId } from '$lib/domain/types';

/**
 * Tempo the metronome starts a series at: the tempo of `first`'s execution (the exercise of the
 * first prompt), else the first tempo of the executions, else the default. A later prompt of an
 * execution at another tempo restarts the metronome after a counted bar (decision 4).
 */
export function sessionTempo(executions: readonly Execution[], first?: ExerciseId): number {
	const own = executions.find((execution) => execution.exerciseId === first)?.tempoBpm ?? null;
	const any = executions.find((execution) => execution.tempoBpm !== null)?.tempoBpm ?? null;
	return own ?? any ?? DEFAULT_TEMPO_BPM;
}
