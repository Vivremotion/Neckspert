import type { ExerciseDefinition } from '$lib/domain/exercise';
import type { RhythmItem } from '$lib/domain/mechanics';
import {
	Fraction,
	RHYTHM_SENSOR,
	compileCyclePlan,
	sameMeter,
	type Figure,
	type Meter,
	type RoundPlan
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { landingBar, rhythmParamsOf } from './rhythmExercise';

/**
 * A cycle is settled this far (in bars) after its last bar ends, so an attack reported a little
 * late (detection, the scheduler's wake-up) still reaches it.
 */
export const SETTLE_AFTER_BARS = Fraction.of(1, 4);

/** The sensor a figure exercise listens to: its `params.sensor`, else the rhythm's. */
export function cycleSensorOf(definition: ExerciseDefinition): string {
	const sensor = definition.params.sensor;
	return typeof sensor === 'string' ? sensor : RHYTHM_SENSOR;
}

/** The figure an item names, among its exercise's; throws on one the exercise does not write. */
export function figureOf(definition: ExerciseDefinition, figureId: string): Figure {
	const found = definition.figures?.find((figure) => figure.id === figureId);
	if (!found) throw new Error(`${definition.id} has no figure ${figureId}`);
	return found.figure;
}

/**
 * A cycle's plan from its item's figure and the resolved params of its level (D8): its cycle
 * bars, window and accompaniment. `startBar` is the cycle's first bar in the loops of the figure
 * and of the accompaniment, counted from the run's first bar; by default the first muted bar
 * (`landingBar`), where a run's first cycle starts. Throws when the figure is not in `meter`.
 */
export function compileCycle(
	definition: ExerciseDefinition,
	item: PlannedItem<RhythmItem>,
	meter: Meter,
	startBar?: number
): RoundPlan {
	const params = rhythmParamsOf(definition, item.exerciseLevel);
	const figure = figureOf(definition, item.item.figureId);
	if (!sameMeter(figure.meter, meter)) {
		throw new RangeError(`the figure ${item.item.figureId} is not in the meter played`);
	}
	return compileCyclePlan({
		figure,
		cycleBars: params.cycleBars,
		startBar: startBar ?? landingBar(params.accompaniment),
		sensor: cycleSensorOf(definition),
		window: params.window,
		accompanimentBars: params.accompaniment.bars
	});
}
