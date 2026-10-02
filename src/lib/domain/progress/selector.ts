import type { Attempt, CardState, PlannedItem } from '$lib/domain/types';

export interface SelectorContext {
	now: number;
	/** Time since the session started. */
	elapsedMs: number;
	fatigued: boolean;
}

/** The card a learning attempt just made learned. */
export type RecordOutcome = { learned: CardState } | null;

/** Chooses each prompt of a session, one at a time. */
export interface SessionSelector {
	/** Next prompt, or null when the session is over. */
	next(context: SelectorContext): PlannedItem | null;
	/** Synchronous. Feeds a judged attempt back so retests and counters advance. */
	record(attempt: Attempt, now: number): RecordOutcome;
	/** A card the session stored (cold review, learning), so the selector's copy stays current. */
	cardChanged(card: CardState): void;
}

/** Serves a fixed list in order (placement, free play). */
export function createListSelector(items: readonly PlannedItem[]): SessionSelector {
	const queue = [...items];
	return {
		next: () => queue.shift() ?? null,
		record: () => null,
		cardChanged: () => {}
	};
}
