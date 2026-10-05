import {
	acceptableMidis,
	classifyNoteConfusion,
	locateItemKey,
	parseLocateItem,
	type LocateItem
} from '$lib/domain/music';
import type { Midi } from '$lib/domain/music/types';
import { beatTiming } from '$lib/domain/timing';
import type { Confusion } from '$lib/domain/types';
import type { MechanicRules } from './types';

/** Play the note on the named string, on the target beat. */
export const locateRules: MechanicRules<LocateItem, { midi: Midi }, { midi: Midi }, Confusion> = {
	id: 'locate',
	timing: beatTiming,
	learner: 'memory',
	itemKey: locateItemKey,
	parseItem: parseLocateItem,
	judge: (item, { midi }) => ({
		correct: acceptableMidis(item).includes(midi),
		answer: { midi },
		confusion: classifyNoteConfusion(item, midi)
	})
};
