import { locateItemKey, parseLocateItem, type Confusion, type LocateItem } from '$lib/domain/music';
import type { Midi } from '$lib/domain/music/types';
import type { ItemSet } from './types';

/** `Attempt.data` of a locate attempt. */
export interface LocateData {
	item: LocateItem;
	/** The played note; null without an answer. */
	answer: { midi: Midi } | null;
	confusion: Confusion | null;
}

/** A note named on a string: play it there. */
export const noteOnStringSet: ItemSet<LocateItem> = {
	id: 'note-on-string',
	itemKey: locateItemKey,
	parseItem: parseLocateItem
};
