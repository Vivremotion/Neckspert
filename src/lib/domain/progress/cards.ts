import type { TimingRelation } from '$lib/domain/timing';
import {
	isSuccess,
	SHORTEST_LEAD,
	type Attempt,
	type CardKey,
	type CardState,
	type CardStatus,
	type Temperature
} from '$lib/domain/types';
import type { MechanicId } from '$lib/domain/exercise/types';
import { MASTERY_ACCURACY, MASTERY_MIN_GAP_MS, MASTERY_SESSIONS } from './constants';
import { Rating, graduateToReview, introScheduling, reviewScheduling } from './scheduling';
import type { Grade } from 'ts-fsrs';

/** What a card is before it has a state: its key, mechanic and item. */
interface NewCard<I> {
	key: CardKey;
	mechanic: MechanicId;
	item: I;
}

/** Fields of an attempt the time relation judges direct recall on, at the attempt's tempo. */
type RecallFields = Pick<Attempt, 'correct' | 'verdict' | 'reactionMs' | 'leadBeats' | 'tempoBpm'>;

function gradeFor(attempt: Attempt, timing: TimingRelation): Grade {
	if (!attempt.correct) return Rating.Again;
	// Off beat (found too late) and right-but-not-direct both grade Hard.
	if (timing.isDirectRecall(attempt)) return Rating.Good;
	return Rating.Hard;
}

function qualifiesAsAcquired(state: CardState, attempt: Attempt, timing: TimingRelation): boolean {
	if (attempt.temperature !== 'cold') return false;
	if (!timing.isDirectRecall(attempt)) return false;
	return attempt.sessionId !== state.introducedInSession;
}

/** New card after warm learning; first cold check is due after MIN_COLD_DELAY_MS. */
export function introduceCard<I>(
	card: NewCard<I>,
	now: number,
	sessionId: string,
	timing: TimingRelation
): CardState<I> {
	return {
		key: card.key,
		mechanic: card.mechanic,
		item: card.item,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: timing.initialLead,
		scheduling: introScheduling(now),
		learnedAt: null,
		acquiredAt: null,
		masteredAt: null
	};
}

/**
 * In-session learning done: direct-recall lead at `tempoBpm` (the execution's), first cold
 * check after MIN_COLD_DELAY_MS.
 */
export function markLearned<I>(
	card: CardState<I>,
	now: number,
	timing: TimingRelation,
	tempoBpm: number | null
): CardState<I> {
	return {
		...card,
		learnedAt: now,
		leadBeats: timing.learnedLead(tempoBpm),
		scheduling: introScheduling(now)
	};
}

/**
 * Probe success (first unaided prompt of a new note) → Review + learned + acquired.
 * Failure or non-direct → null. Direct recall is judged at the attempt's own tempo.
 */
export function probeCard<I>(
	card: NewCard<I>,
	attempt: Attempt,
	now: number,
	sessionId: string,
	timing: TimingRelation
): CardState<I> | null {
	if (!timing.isDirectRecall(attempt)) return null;
	return {
		key: card.key,
		mechanic: card.mechanic,
		item: card.item,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats:
			attempt.leadBeats === null || attempt.leadBeats === 1 ? SHORTEST_LEAD : attempt.leadBeats,
		scheduling: graduateToReview(now),
		learnedAt: now,
		acquiredAt: now,
		masteredAt: null
	};
}

/**
 * A passed probe is cold, a missed one hot: a miss measures no forgetting, since the note
 * was never learned, so it must stay out of retention stats.
 * Spec 2026-10-03-sondage-avant-apprentissage-design.md, section 1.
 */
export function probeTemperature(attempt: RecallFields, timing: TimingRelation): Temperature {
	return timing.isDirectRecall(attempt) ? 'cold' : 'hot';
}

/**
 * Updates FSRS, lead, acquiredAt and masteredAt for a cold attempt.
 * `history` is every attempt of this card, oldest first, including `attempt`.
 */
export function applyColdAttempt<I>(
	state: CardState<I>,
	attempt: Attempt,
	history: readonly Attempt[],
	now: number,
	timing: TimingRelation
): CardState<I> {
	if (attempt.temperature !== 'cold') return state;

	const scheduling = reviewScheduling(state.scheduling, gradeFor(attempt, timing), now);
	// An off-beat answer lengthens the lead like a miss.
	const leadBeats = timing.adjustLead(state.leadBeats, isSuccess(attempt));
	const acquiredAt = state.acquiredAt ?? (qualifiesAsAcquired(state, attempt, timing) ? now : null);
	const next: CardState<I> = {
		...state,
		scheduling,
		leadBeats,
		acquiredAt
	};
	const masteredAt = next.masteredAt ?? (isMastered(history, timing) ? now : null);
	return { ...next, masteredAt };
}

export function isAcquired(
	state: CardState,
	history: readonly Attempt[],
	timing: TimingRelation
): boolean {
	if (state.acquiredAt !== null) return true;
	return history.some((attempt) => qualifiesAsAcquired(state, attempt, timing));
}

/** Each attempt is judged at its own tempo. */
export function isMastered(history: readonly Attempt[], timing: TimingRelation): boolean {
	const cold = history.filter((attempt) => attempt.temperature === 'cold');
	if (cold.length === 0) return false;

	const directCount = cold.filter((attempt) => timing.isDirectRecall(attempt)).length;
	if (directCount / cold.length < MASTERY_ACCURACY) return false;

	const successBySession = new Map<string, number>();
	for (const attempt of cold) {
		if (!timing.isDirectRecall(attempt)) continue;
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
