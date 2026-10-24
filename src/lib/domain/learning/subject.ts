import type { LeadBeats } from '../types';
import type { Level } from '../time/levels';

/** What a level of an item changes: how long before the beat it is asked, and whether it is aided. */
export interface LadderParams {
	/** Beats of lead; null when the item has no lead (the answer is not played on a beat). */
	leadBeats: LeadBeats | null;
	aided: boolean;
}

/** An item's levels, level 0 first: the longest lead (aided), then shorter ones. */
export type Ladder = readonly Level<LadderParams>[];
