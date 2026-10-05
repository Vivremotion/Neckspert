import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';
import type { Execution } from '$lib/domain/types';

/**
 * Tempo the metronome runs a session at: the only non-null tempo of its executions, the default
 * without one. Two different tempos throw (decision 4): restarting the metronome in a counted bar
 * will come with the first need, where the change of scene is; the controller already reads the
 * tempo of each prompt's execution so that change stays local.
 */
export function sessionTempo(executions: readonly Execution[]): number {
	const tempos = new Set(
		executions.flatMap((execution) => (execution.tempoBpm === null ? [] : [execution.tempoBpm]))
	);
	if (tempos.size > 1) {
		throw new Error(
			`A session runs at one tempo (decision 4), got ${[...tempos].join(' and ')} bpm`
		);
	}
	const [tempo] = tempos;
	return tempo ?? DEFAULT_TEMPO_BPM;
}
