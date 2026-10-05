import {
	classifyNameConfusion,
	identifyItemKey,
	parseIdentifyItem,
	pitchOnString,
	type IdentifyItem
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { identifyTiming } from '$lib/domain/timing';
import type { Confusion } from '$lib/domain/types';
import type { MechanicRules } from './types';

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
	judge: (item, pitch) => {
		const expected = pitchOnString(item.string, item.fret);
		return {
			correct: pitch === expected,
			answer: { pitch },
			confusion: classifyNameConfusion(expected, pitch)
		};
	}
};
