import { IDENTIFY_NECK } from '$lib/domain/exercise/catalog';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { beatPlan, freePlan } from '$lib/domain/exercise/roundPlans';
import { NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import type { Meter } from '$lib/domain/time/meter';
import type { RoundPlan } from '$lib/domain/time/plan';
import { RESPIRATION_BARS } from '$lib/domain/timing/grid';
import type { PlannedItem } from '$lib/domain/types';

/**
 * The round plan of a prompt of the neck: a note located on the beat at its lead, then a
 * breathing bar; a note named in free time, judged against the exercise's recall threshold.
 */
export function neckPlan(item: PlannedItem, meter: Meter): RoundPlan {
	if (item.mechanic === 'locate') {
		if (item.leadBeats === null) throw new Error('A locate prompt needs a lead');
		return beatPlan({
			content: { kind: NOTE_CONTENT, value: item.item },
			leadBeats: item.leadBeats,
			meter,
			respirationBars: RESPIRATION_BARS
		});
	}
	const recallThresholdMs = recallThresholdOf(IDENTIFY_NECK);
	if (recallThresholdMs === null) throw new Error('The identify exercise declares no threshold');
	return freePlan({ content: { kind: NAME_CONTENT, value: item.item }, recallThresholdMs });
}
