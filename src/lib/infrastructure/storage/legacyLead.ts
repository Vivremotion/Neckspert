import { SHORTEST_LEAD, type CardState } from '$lib/domain/types';

/**
 * Cards stored before 2026-10-04 could hold the dropped 1-beat lead step. They move to the
 * shortest step left. Attempts keep their recorded lead: history is not rewritten.
 */
export function withoutLegacyLead<T extends Pick<CardState, 'leadBeats'>>(card: T): T {
	return (card.leadBeats as number) === 1 ? { ...card, leadBeats: SHORTEST_LEAD } : card;
}
