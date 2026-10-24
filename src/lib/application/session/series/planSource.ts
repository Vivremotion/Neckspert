import type { RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';

/** The round plan of an item, by the exercise's data; the controller never builds a plan itself. */
export type PlanSource = (item: PlannedItem) => RoundPlan;
