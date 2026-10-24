import type { TimingRelation } from '$lib/domain/timing';
import type { DirectRecall } from '$lib/domain/learning/recall';
import {
	SHORTEST_LEAD,
	type Attempt,
	type CardKey,
	type CardState,
	type CardStatus,
	type LeadBeats,
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

/** Fields of an attempt the direct-recall rule reads, at the attempt's tempo. */
type RecallFields = Parameters<DirectRecall>[0];

/**
 * The stored lead of a card a new card or a probe starts with: a placeholder, the old path sets
 * the real one with `cardLeadAfter` (H3 removes it with `CardState.leadBeats`).
 */
const PLACEHOLDER_LEAD: LeadBeats = SHORTEST_LEAD;

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

/** What moved a card's stored lead, for `cardLeadAfter`. */
export type CardLeadEvent =
	'introduced' | { learned: number | null } | { probe: Attempt } | { cold: Attempt };

/**
 * The stored lead of `state` after `event`, as the old path set it: the relation's first lead
 * at introduction, its direct-recall lead at `learned`'s tempo, the probe's own lead (1 read as
 * the shortest), one step shorter or longer after a cold attempt (an off-beat answer lengthens it
 * like a miss). Only the old path calls it; H3 removes it with `CardState.leadBeats`.
 */
export function cardLeadAfter(
	state: CardState,
	timing: TimingRelation,
	event: CardLeadEvent
): LeadBeats {
	if (event === 'introduced') return timing.initialLead;
	if ('learned' in event) return timing.learnedLead(event.learned);
	if ('probe' in event) {
		const lead = event.probe.leadBeats;
		return lead === null || lead === 1 ? SHORTEST_LEAD : lead;
	}
	if (event.cold.temperature !== 'cold') return state.leadBeats;
	return timing.adjustLead(state.leadBeats, event.cold.success);
}

/** New card after warm learning; first cold check is due after MIN_COLD_DELAY_MS. */
export function introduceCard<I>(card: NewCard<I>, now: number, sessionId: string): CardState<I> {
	return {
		key: card.key,
		mechanic: card.mechanic,
		item: card.item,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: PLACEHOLDER_LEAD,
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
 * Probe success (first unaided prompt of a new note) → Review + learned + acquired.
 * Failure or non-direct → null. Direct recall is judged at the attempt's own tempo.
 */
export function probeCard<I>(
	card: NewCard<I>,
	attempt: Attempt,
	now: number,
	sessionId: string,
	recall: DirectRecall
): CardState<I> | null {
	if (!recall(attempt)) return null;
	return {
		key: card.key,
		mechanic: card.mechanic,
		item: card.item,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: PLACEHOLDER_LEAD,
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
export function probeTemperature(attempt: RecallFields, recall: DirectRecall): Temperature {
	return recall(attempt) ? 'cold' : 'hot';
}

/**
 * Updates FSRS, acquiredAt and masteredAt for a cold attempt; the stored lead is left as it is.
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
