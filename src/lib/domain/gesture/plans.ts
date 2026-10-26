import { gridChangePlan } from '$lib/domain/exercise/roundPlans';
import { CHORD_GRID_CONTENT } from '$lib/domain/judges';
import type { ChordGridItem } from '$lib/domain/mechanics';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { windowsOf } from '$lib/domain/exercise/windows';
import type { Meter } from '$lib/domain/time/meter';
import type { RoundPlan } from '$lib/domain/time/plan';

/** The round plan of a change of a grid: the chord asked, on the grid relation's timing. */
export function gesturePlan(
	item: ChordGridItem,
	meter: Meter,
	definition: ExerciseDefinition
): RoundPlan {
	return gridChangePlan({
		content: { kind: CHORD_GRID_CONTENT, value: item },
		lengthBeats: item.changes[item.index].length,
		meter,
		windows: windowsOf(definition)
	});
}
