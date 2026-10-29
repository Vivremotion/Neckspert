import type { LevelState } from '$lib/domain/time/levels';
import type { Attempt, CardState, PlannedItem } from '$lib/domain/types';

export interface SelectorContext {
	now: number;
	/** Time since the session started. */
	elapsedMs: number;
	fatigued: boolean;
}

/**
 * What an attempt just changed: its card (a note learned, a probe passed or missed), its level
 * (the learning procedure moves it), or both; null when nothing changed.
 */
export type RecordOutcome = { card?: CardState; level?: LevelState } | null;

/** Gives a series its items, one at a time: the learning procedure, a fixed list, the gesture's passages. */
export interface ItemSource {
	/** Next prompt, or null when the session is over. */
	next(context: SelectorContext): PlannedItem | null;
	/** Synchronous. Feeds a judged attempt back so retests and counters advance. */
	record(attempt: Attempt, now: number): RecordOutcome;
	/** A card the session stored (cold review, learning), so the source's copy stays current. */
	cardChanged(card: CardState): void;
	/**
	 * The item it served, at another level of its exercise (`PlannedItem.exerciseLevel`), for a
	 * source whose items depend on that level (a figure that fits the level's cycle). Absent: the
	 * series changes the level alone.
	 */
	atLevel?(item: PlannedItem, exerciseLevel: number): PlannedItem;
}

/** Serves a fixed list in order (free play). */
export function createListSource(items: readonly PlannedItem[]): ItemSource {
	const queue = [...items];
	return {
		next: () => queue.shift() ?? null,
		record: () => null,
		cardChanged: () => {}
	};
}
