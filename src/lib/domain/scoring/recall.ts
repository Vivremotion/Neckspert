import { RECALL_THRESHOLD_MS, type Attempt } from '$lib/domain/types';

/**
 * Mode 1: a right answer whose lead fits in RECALL_THRESHOLD_MS.
 * Mode 2 (`leadBeats` null): a right answer whose reaction does.
 */
export function isDirectRecall(
	attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>,
	tempoBpm: number
): boolean {
	if (!attempt.correct) return false;
	if (attempt.leadBeats === null) {
		return attempt.reactionMs !== null && attempt.reactionMs <= RECALL_THRESHOLD_MS;
	}
	return (attempt.leadBeats * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS;
}
