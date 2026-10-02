import type { Attempt, CardKey, CardState, Target } from '$lib/domain/types';
import { MIN_COLD_DELAY_MS } from './constants';

/** Latest prompt time of each card, any phase. */
export function lastAttemptByCard(attempts: readonly Attempt[]): Map<CardKey, number> {
	const last = new Map<CardKey, number>();
	for (const attempt of attempts) {
		const previous = last.get(attempt.cardKey);
		if (previous === undefined || attempt.promptedAt > previous) {
			last.set(attempt.cardKey, attempt.promptedAt);
		}
	}
	return last;
}

/**
 * When a learned card can next be reviewed cold: due, and untouched for MIN_COLD_DELAY_MS.
 * Null while the card is still being learned.
 */
export function reviewableAt(card: CardState, lastAttemptAt: number | undefined): number | null {
	if (card.learnedAt === null) return null;
	if (lastAttemptAt === undefined) return card.scheduling.due;
	return Math.max(card.scheduling.due, lastAttemptAt + MIN_COLD_DELAY_MS);
}

function directionRank(target: Target): number {
	return target.direction === 'locate' ? 0 : 1;
}

/** Cards that would be reviewed cold now: by due time, locate first, then key. */
export function reviewableCards(
	cards: readonly CardState[],
	lastByCard: ReadonlyMap<CardKey, number>,
	now: number
): CardState[] {
	return cards
		.filter((card) => {
			const at = reviewableAt(card, lastByCard.get(card.key));
			return at !== null && at <= now;
		})
		.sort((a, b) => {
			if (a.scheduling.due !== b.scheduling.due) return a.scheduling.due - b.scheduling.due;
			const byDirection = directionRank(a.target) - directionRank(b.target);
			if (byDirection !== 0) return byDirection;
			return a.key.localeCompare(b.key);
		});
}

/** Earliest time a learned card becomes reviewable cold. Null without a learned card. */
export function nextReviewAt(
	cards: readonly CardState[],
	lastByCard: ReadonlyMap<CardKey, number>
): number | null {
	let earliest: number | null = null;
	for (const card of cards) {
		const at = reviewableAt(card, lastByCard.get(card.key));
		if (at !== null && (earliest === null || at < earliest)) earliest = at;
	}
	return earliest;
}
