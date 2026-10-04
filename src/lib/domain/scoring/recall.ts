import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS, type Attempt } from '$lib/domain/types';

/**
 * Mode 1: a right answer whose lead fits in RECALL_THRESHOLD_MS.
 * Mode 2 (`leadBeats` null): a right answer whose reaction fits in IDENTIFY_RECALL_THRESHOLD_MS.
 */
export function isDirectRecall(
	attempt: Pick<Attempt, 'correct' | 'verdict' | 'reactionMs' | 'leadBeats'>,
	tempoBpm: number
): boolean {
	// Found after the window means found by calculation: never direct recall.
	if (!attempt.correct || attempt.verdict === 'offbeat') return false;
	if (attempt.leadBeats === null) {
		return attempt.reactionMs !== null && attempt.reactionMs <= IDENTIFY_RECALL_THRESHOLD_MS;
	}
	return (attempt.leadBeats * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS;
}
