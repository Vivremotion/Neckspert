import {
	identifyItemKey,
	parseIdentifyItem,
	type Confusion,
	type IdentifyItem
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import type { ItemSet } from './types';

/** `Attempt.data` of an identify attempt. */
export interface IdentifyData {
	item: IdentifyItem;
	/** The tapped name; null without an answer. */
	answer: { pitch: PitchName } | null;
	confusion: Confusion | null;
}

/** A note at a fret of a string: name it. */
export const placedNoteSet: ItemSet<IdentifyItem> = {
	id: 'placed-note',
	itemKey: identifyItemKey,
	parseItem: parseIdentifyItem
};
