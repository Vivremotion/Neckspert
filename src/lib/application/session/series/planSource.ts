import type { Meter, RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';

/**
 * The round plan of an item in the series' meter, by the exercise's data; the controller never
 * builds a plan itself.
 */
export type PlanSource = (item: PlannedItem, meter: Meter) => RoundPlan;
