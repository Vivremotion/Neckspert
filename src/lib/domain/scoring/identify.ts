import type { PitchName } from '$lib/domain/music/types';
import { RECALL_THRESHOLD_MS, type Verdict } from '$lib/domain/types';
import { secondsToMs, unanswered, type Judgement } from './judgement';

/**
 * Times in audio seconds; `answerTime` null means no answer.
 * A tap before the prompt, or a time without a name, also counts as no answer.
 */
export function judgeIdentify(input: {
	expected: PitchName;
	promptTime: number;
	answerTime: number | null;
	answered: PitchName | null;
}): Judgement {
	const { expected, promptTime, answerTime, answered } = input;
	if (answerTime === null || answered === null) return unanswered();
	const reactionMs = secondsToMs(answerTime - promptTime);
	if (reactionMs < 0) return unanswered();
	const correct = answered === expected;
	return {
		answer: { kind: 'name', pitch: answered },
		correct,
		verdict: correct ? speedVerdict(reactionMs) : 'wrong',
		timingOffsetMs: null,
		reactionMs
	};
}

function speedVerdict(reactionMs: number): Verdict {
	return reactionMs <= RECALL_THRESHOLD_MS ? 'perfect' : 'late';
}
