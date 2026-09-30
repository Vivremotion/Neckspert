import { median } from '$lib/domain/stats';
import type { Attempt } from '$lib/domain/types';

/** Answered attempts needed before fatigue can be detected. To calibrate. */
export const FATIGUE_MIN_ANSWERS = 12;

/** Size of the opening and closing slices that are compared. To calibrate. */
export const FATIGUE_WINDOW = 6;

/** Accuracy drop between the slices, as a fraction (0.2 = 20 points). To calibrate. */
export const FATIGUE_ACCURACY_DROP = 0.2;

/** Median reaction time increase between the slices, as a fraction (0.25 = 25 %). To calibrate. */
export const FATIGUE_REACTION_INCREASE = 0.25;

/** `attempts` of one session, oldest first. Unanswered attempts are left out. */
export function detectFatigue(attempts: readonly Attempt[]): boolean {
	const answered = attempts.filter((attempt) => attempt.answer !== null);
	if (answered.length < FATIGUE_MIN_ANSWERS) return false;
	const first = answered.slice(0, FATIGUE_WINDOW);
	const last = answered.slice(-FATIGUE_WINDOW);
	return accuracyDropped(first, last) || reactionSlowed(first, last);
}

function correctCount(attempts: readonly Attempt[]): number {
	return attempts.filter((attempt) => attempt.correct).length;
}

/** Counts are subtracted before dividing: 1 − 4/5 in floating point falls just under 0.2. */
function accuracyDropped(first: readonly Attempt[], last: readonly Attempt[]): boolean {
	return (correctCount(first) - correctCount(last)) / first.length >= FATIGUE_ACCURACY_DROP;
}

function reactionSlowed(first: readonly Attempt[], last: readonly Attempt[]): boolean {
	const before = median(reactionTimes(first));
	const after = median(reactionTimes(last));
	if (before === null || after === null) return false;
	return after >= before * (1 + FATIGUE_REACTION_INCREASE);
}

/** Mode 2 only: a mode 1 reaction time is mostly the lead, not the player slowing down. */
function reactionTimes(attempts: readonly Attempt[]): number[] {
	return attempts.flatMap((attempt) =>
		attempt.leadBeats === null && attempt.reactionMs !== null ? [attempt.reactionMs] : []
	);
}
