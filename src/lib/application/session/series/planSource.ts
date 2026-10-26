import type { Meter, RoundPlan } from '$lib/domain/time';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { PlannedItem } from '$lib/domain/types';

/**
 * The round plan of an item in the series' meter, by the data of the item's exercise; the controller never
 * builds a plan itself.
 */
export type PlanSource = (
	item: PlannedItem,
	meter: Meter,
	definition: ExerciseDefinition
) => RoundPlan;
