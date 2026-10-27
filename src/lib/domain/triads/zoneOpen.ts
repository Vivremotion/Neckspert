import type { CardState } from '$lib/domain/types';

/**
 * Triads acquired in anchor before the zone exercise shows on the home screen: one family (a
 * root's three inversions, in major and minor), enough to fill a session. To calibrate.
 */
export const ZONE_MIN_ACQUIRED_TRIADS = 6;

/**
 * Whether the zone exercise is open: `ZONE_MIN_ACQUIRED_TRIADS` triads acquired in anchor give it
 * enough to ask; once it has a card, it stays open.
 */
export function triadZoneOpen(cards: readonly CardState[]): boolean {
	if (cards.some((card) => card.mechanic === 'triad-zone')) return true;
	const acquired = cards.filter(
		(card) => card.mechanic === 'triad-anchor' && card.acquiredAt !== null
	);
	return acquired.length >= ZONE_MIN_ACQUIRED_TRIADS;
}
