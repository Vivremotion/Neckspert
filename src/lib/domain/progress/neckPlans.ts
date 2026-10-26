import { pacingOf } from '$lib/domain/exercise/pacing';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { beatPlan, freePlan } from '$lib/domain/exercise/roundPlans';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { windowsOf } from '$lib/domain/exercise/windows';
import { NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import type { Meter } from '$lib/domain/time/meter';
import type { RoundPlan } from '$lib/domain/time/plan';
import type { PlannedItem } from '$lib/domain/types';

/**
 * The round plan of a prompt of the neck: a note located on the beat at its lead, then a
 * breathing bar; a note named in free time, judged against the exercise's recall threshold.
 * The windows, the breath and the threshold are those of the item's exercise.
 */
export function neckPlan(
	item: PlannedItem,
	meter: Meter,
	definition: ExerciseDefinition
): RoundPlan {
	if (item.mechanic === 'locate') {
		if (item.leadBeats === null) throw new Error('A locate prompt needs a lead');
		return beatPlan({
			content: { kind: NOTE_CONTENT, value: item.item },
			leadBeats: item.leadBeats,
			meter,
			respirationBars: pacingOf(definition).respirationBars,
			windows: windowsOf(definition)
		});
	}
	const recallThresholdMs = recallThresholdOf(definition);
	if (recallThresholdMs === null) throw new Error('The exercise declares no threshold');
	return freePlan({ content: { kind: NAME_CONTENT, value: item.item }, recallThresholdMs });
}
