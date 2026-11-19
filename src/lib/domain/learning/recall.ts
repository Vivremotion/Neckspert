import type { SkillDefinition } from '../skill/types';
import type { Attempt } from '../types';
import { isDirectRecall, type ResponseValue } from '../time/modes/responseVerdict';

export type DirectRecall = (
	attempt: Pick<Attempt, 'success' | 'verdict' | 'reactionMs' | 'leadBeats' | 'tempoBpm'>
) => boolean;

/**
 * Direct recall of an attempt within `thresholdMs`: a `response` envelope by `isDirectRecall`
 * (H1); an older one by its fields — success, and lead × beat ≤ threshold, or, without lead
 * (free time), reaction ≤ threshold.
 */
export function directRecallWithin(thresholdMs: number): DirectRecall {
	return (attempt) => {
		if (!attempt.success) return false;
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

/** What counts as a direct recall of a skill: within the time it writes; null when it writes none. */
export function directRecallOf(skill: SkillDefinition): DirectRecall | null {
	return skill.directRecall === undefined ? null : directRecallWithin(skill.directRecall.withinMs);
}
