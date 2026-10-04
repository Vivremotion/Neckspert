import {
	IDENTIFY_RECALL_THRESHOLD_MS,
	LEAD_STEPS,
	RECALL_THRESHOLD_MS,
	SHORTEST_LEAD,
	type Attempt,
	type Direction,
	type LeadBeats
} from '$lib/domain/types';

/** Longest lead step whose duration at `tempoBpm` fits in RECALL_THRESHOLD_MS; at least SHORTEST_LEAD. */
export function leadForThreshold(tempoBpm: number): LeadBeats {
	// LEAD_STEPS is longest→shortest; first fit is the longest allowed.
	for (const step of LEAD_STEPS) {
		if ((step * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS) {
			return step;
		}
	}
	return SHORTEST_LEAD;
}

/**
 * Mode 1 (`leadBeats` set): correct and lead duration ≤ RECALL_THRESHOLD_MS.
 * Mode 2 (`leadBeats` null): correct and reactionMs ≤ IDENTIFY_RECALL_THRESHOLD_MS.
 * Package-internal — not part of the public C API (plan B owns the scoring export).
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

/** One LEAD_STEPS step shorter on success, one longer on failure; identify stays at SHORTEST_LEAD. */
export function adjustLeadBeats(
	current: LeadBeats,
	correct: boolean,
	direction: Direction
): LeadBeats {
	if (direction === 'identify') return SHORTEST_LEAD;
	const index = LEAD_STEPS.indexOf(current);
	const nextIndex = correct ? Math.min(index + 1, LEAD_STEPS.length - 1) : Math.max(index - 1, 0);
	return LEAD_STEPS[nextIndex];
}
