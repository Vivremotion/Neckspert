import { CONTENT_JUDGES, NOTE_CONTENT } from '$lib/domain/judges';
import { locateItemKey, parseLocateItem, type Confusion, type LocateItem } from '$lib/domain/music';
import type { Midi } from '$lib/domain/music/types';
import type { MechanicRules } from './types';

/** `Attempt.data` of a locate attempt. */
export interface LocateData {
	item: LocateItem;
	/** The played note; null without an answer. */
	answer: { midi: Midi } | null;
	confusion: Confusion | null;
}

/** Play the note on the named string, on the target beat. */
export const locateRules: MechanicRules<LocateItem, { midi: Midi }, { midi: Midi }, Confusion> = {
	id: 'locate',
	learner: 'memory',
	itemKey: locateItemKey,
	parseItem: parseLocateItem,
	judge: (item, payload) =>
		CONTENT_JUDGES[NOTE_CONTENT].judge(item, payload) as {
			correct: boolean;
			answer: { midi: Midi };
			confusion: Confusion | null;
		}
};
