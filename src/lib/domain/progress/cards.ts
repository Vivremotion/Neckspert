import type { DirectRecall } from '$lib/domain/learning/recall';
import { type Attempt, type CardKey, type CardState, type CardStatus } from '$lib/domain/types';
import type { SkillId } from '$lib/domain/skill/types';
import { MASTERY_ACCURACY, MASTERY_MIN_GAP_MS, MASTERY_SESSIONS } from './constants';
import { Rating, introScheduling, reviewScheduling } from './scheduling';
import type { Grade } from 'ts-fsrs';

/** What a card is before it has a state: its key, skill and item. */
interface NewCard<I> {
	key: CardKey;
	skill: SkillId;
	item: I;
}

function gradeFor(attempt: Attempt, recall: DirectRecall): Grade {
	if (attempt.correct !== true) return Rating.Again;
	// Off beat (found too late) and right-but-not-direct both grade Hard.
	if (recall(attempt)) return Rating.Good;
	return Rating.Hard;
}

function qualifiesAsAcquired(state: CardState, attempt: Attempt, recall: DirectRecall): boolean {
	if (attempt.temperature !== 'cold') return false;
	if (!recall(attempt)) return false;
	return attempt.sessionId !== state.introducedInSession;
}

/** New card after warm learning; first cold check is due after MIN_COLD_DELAY_MS. */
export function introduceCard<I>(card: NewCard<I>, now: number, sessionId: string): CardState<I> {
	return {
		key: card.key,
		skill: card.skill,
		item: card.item,
		introducedAt: now,
		introducedInSession: sessionId,
		scheduling: introScheduling(now),
		learnedAt: null,
		acquiredAt: null,
		masteredAt: null
	};
}

/** In-session learning done: first cold check after MIN_COLD_DELAY_MS. */
export function markLearned<I>(card: CardState<I>, now: number): CardState<I> {
	return {
		...card,
		learnedAt: now,
		scheduling: introScheduling(now)
	};
}

/**
 * Updates FSRS, acquiredAt and masteredAt for a cold attempt.
 * `history` is every attempt of this card, oldest first, including `attempt`.
 */
export function applyColdAttempt<I>(
	state: CardState<I>,
	attempt: Attempt,
	history: readonly Attempt[],
	now: number,
	recall: DirectRecall
): CardState<I> {
	if (attempt.temperature !== 'cold') return state;

	const scheduling = reviewScheduling(state.scheduling, gradeFor(attempt, recall), now);
	const acquiredAt = state.acquiredAt ?? (qualifiesAsAcquired(state, attempt, recall) ? now : null);
	const next: CardState<I> = {
		...state,
		scheduling,
		acquiredAt
	};
	const masteredAt = next.masteredAt ?? (isMastered(history, recall) ? now : null);
	return { ...next, masteredAt };
}

export function isAcquired(
	state: CardState,
	history: readonly Attempt[],
	recall: DirectRecall
): boolean {
	if (state.acquiredAt !== null) return true;
	return history.some((attempt) => qualifiesAsAcquired(state, attempt, recall));
}

/** Each attempt is judged at its own tempo. */
export function isMastered(history: readonly Attempt[], recall: DirectRecall): boolean {
	const cold = history.filter((attempt) => attempt.temperature === 'cold');
	if (cold.length === 0) return false;

	const directCount = cold.filter((attempt) => recall(attempt)).length;
	if (directCount / cold.length < MASTERY_ACCURACY) return false;

	const successBySession = new Map<string, number>();
	for (const attempt of cold) {
		if (!recall(attempt)) continue;
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
