import type { Attempt } from '../types';
import { isDirectRecall, type ResponseValue } from '../time/modes/responseVerdict';

export type DirectRecall = (
	attempt: Pick<Attempt, 'success' | 'verdict' | 'reactionMs' | 'leadBeats' | 'tempoBpm'>
) => boolean;

/**
 * Direct recall of an attempt against `thresholdMs`: a `response` envelope by `isDirectRecall`
 * (H1); an older one by its fields — success, and lead × beat ≤ threshold, or, without lead
 * (free time), reaction ≤ threshold. `thresholdMs` null: never.
 */
export function directRecallOf(thresholdMs: number | null): DirectRecall {
	return (attempt) => {
		if (thresholdMs === null || !attempt.success) return false;
		if (attempt.verdict.relation === 'response') {
			return isDirectRecall(attempt.verdict.value as ResponseValue, attempt.success, thresholdMs);
		}
		if (attempt.leadBeats !== null) {
			if (attempt.tempoBpm === null) return false;
			return (attempt.leadBeats * 60_000) / attempt.tempoBpm <= thresholdMs;
		}
		return attempt.reactionMs !== null && attempt.reactionMs <= thresholdMs;
	};
}
