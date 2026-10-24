import { CONTENT_JUDGES, NAME_CONTENT } from '$lib/domain/judges';
import {
	identifyItemKey,
	parseIdentifyItem,
	type Confusion,
	type IdentifyItem
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { identifyTiming } from '$lib/domain/timing';
import type { MechanicRules } from './types';

/** `Attempt.data` of an identify attempt. */
export interface IdentifyData {
	item: IdentifyItem;
	/** The tapped name; null without an answer. */
	answer: { pitch: PitchName } | null;
	confusion: Confusion | null;
}

/** Name the note at a fret of a string, at your own pace. */
export const identifyRules: MechanicRules<
	IdentifyItem,
	PitchName,
	{ pitch: PitchName },
	Confusion
> = {
	id: 'identify',
	timing: identifyTiming,
	learner: 'memory',
	itemKey: identifyItemKey,
	parseItem: parseIdentifyItem,
	judge: (item, pitch) =>
		CONTENT_JUDGES[NAME_CONTENT].judge(item, pitch) as {
			correct: boolean;
			answer: { pitch: PitchName };
			confusion: Confusion | null;
		}
};
