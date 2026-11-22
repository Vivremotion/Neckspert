import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { exerciseById } from '$lib/domain/exercise';
import { METER_4_4, type Meter, type RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { IDENTIFY_NECK } from '$lib/testing/catalog';

/** The plans the series compiles, for specs that need one: compiled from the exercise's template. */

function plannedFor(definition: ExerciseDefinition, item: unknown): PlannedItem {
	return {
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item,
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
}

/** The round of a change of a passage (`testing/gestureSeries`'s `change`), as its exercise writes it. */
export function changePlan(item: PlannedItem, meter: Meter = METER_4_4): RoundPlan {
	return compileRound(exerciseById(item.exerciseId), item, meter, {
		previewBeats: 0,
		fromRunStart: null
	});
}

/** The round of a note named in free time, within the identify exercise's recall threshold. */
export function identifyPlan(item: { string: number; fret: number }): RoundPlan {
	return compileRound(IDENTIFY_NECK, plannedFor(IDENTIFY_NECK, item), METER_4_4, {
		previewBeats: 0,
		fromRunStart: null
	});
}
