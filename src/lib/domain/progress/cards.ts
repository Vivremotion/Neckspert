import {
	cardKey,
	type Attempt,
	type CardState,
	type CardStatus,
	type LocateTarget,
	type Target
} from '$lib/domain/types';
import { MASTERY_ACCURACY, MASTERY_MIN_GAP_MS, MASTERY_SESSIONS } from './constants';
import { adjustLeadBeats, isDirectRecall } from './lead';
import {
	Rating,
	graduateToReview,
	introScheduling,
	reviewScheduling
} from './scheduling';

function gradeFor(attempt: Attempt, tempoBpm: number): (typeof Rating)[keyof typeof Rating] {
	if (!attempt.correct) return Rating.Again;
	if (isDirectRecall(attempt, tempoBpm)) return Rating.Good;
	return Rating.Hard;
}

function qualifiesAsAcquired(state: CardState, attempt: Attempt, tempoBpm: number): boolean {
	if (attempt.temperature !== 'cold') return false;
	if (!isDirectRecall(attempt, tempoBpm)) return false;
	return attempt.sessionId !== state.introducedInSession;
}

/** New card after warm learning; first cold check is due after MIN_COLD_DELAY_MS. */
export function introduceCard(target: Target, now: number, sessionId: string): CardState {
	return {
		key: cardKey(target),
		target,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: target.direction === 'locate' ? 8 : 1,
		scheduling: introScheduling(now),
		acquiredAt: null,
		masteredAt: null
	};
}

/**
 * Placement success → Review + acquired. Failure or non-direct → null.
 * Uses the real session tempo for the direct-recall check.
 */
export function placementCard(
	target: LocateTarget,
	attempt: Attempt,
	now: number,
	sessionId: string,
	tempoBpm: number
): CardState | null {
	if (!isDirectRecall(attempt, tempoBpm)) return null;
	return {
		key: cardKey(target),
		target,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: attempt.leadBeats ?? 1,
		scheduling: graduateToReview(now),
		acquiredAt: now,
		masteredAt: null
	};
}

/**
 * Updates FSRS, lead, acquiredAt and masteredAt for a cold attempt.
 * `history` is every attempt of this card, oldest first, including `attempt`.
 */
export function applyColdAttempt(
	state: CardState,
	attempt: Attempt,
	history: readonly Attempt[],
	now: number,
	tempoBpm: number
): CardState {
	if (attempt.temperature !== 'cold') return state;

	const scheduling = reviewScheduling(state.scheduling, gradeFor(attempt, tempoBpm), now);
	const leadBeats = adjustLeadBeats(
		state.leadBeats,
		attempt.correct,
		state.target.direction
	);
	const acquiredAt =
		state.acquiredAt ?? (qualifiesAsAcquired(state, attempt, tempoBpm) ? now : null);
	const next: CardState = {
		...state,
		scheduling,
		leadBeats,
		acquiredAt
	};
	const masteredAt = next.masteredAt ?? (isMastered(history, tempoBpm) ? now : null);
	return { ...next, masteredAt };
}

export function isAcquired(
	state: CardState,
	history: readonly Attempt[],
	tempoBpm: number
): boolean {
	if (state.acquiredAt !== null) return true;
	return history.some((attempt) => qualifiesAsAcquired(state, attempt, tempoBpm));
}

export function isMastered(history: readonly Attempt[], tempoBpm: number): boolean {
	const cold = history.filter((attempt) => attempt.temperature === 'cold');
	if (cold.length === 0) return false;

	const directCount = cold.filter((attempt) => isDirectRecall(attempt, tempoBpm)).length;
	if (directCount / cold.length < MASTERY_ACCURACY) return false;

	const successBySession = new Map<string, number>();
	for (const attempt of cold) {
		if (!isDirectRecall(attempt, tempoBpm)) continue;
		const previous = successBySession.get(attempt.sessionId);
		if (previous === undefined || attempt.promptedAt > previous) {
			successBySession.set(attempt.sessionId, attempt.promptedAt);
		}
	}
	if (successBySession.size < MASTERY_SESSIONS) return false;

	const successTimes = [...successBySession.values()].sort((a, b) => a - b);
	const latest = successTimes[successTimes.length - 1];
	const previous = successTimes[successTimes.length - 2];
	return latest - previous >= MASTERY_MIN_GAP_MS;
}

export function cardStatus(state: CardState | undefined): CardStatus {
	if (!state) return 'unseen';
	if (state.masteredAt !== null) return 'mastered';
	if (state.acquiredAt !== null) return 'acquired';
	return 'learning';
}
