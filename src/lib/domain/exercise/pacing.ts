import { Fraction } from '$lib/domain/time/fraction';
import { RESPIRATION_BARS } from '$lib/domain/timing/grid';
import { LEAD_STEPS, type LeadBeats } from '$lib/domain/types';
import { leadStepsOf } from './ladder';
import type { ExerciseDefinition, ExercisePacing } from './types';

/** The rhythm of the notes exercises: the breathing bars they always had. */
export const DEFAULT_PACING: ExercisePacing = {
	respirationBars: RESPIRATION_BARS
};

/** The pacing an exercise defines in its params, else the default. */
export function pacingOf(definition: ExerciseDefinition): ExercisePacing {
	const pacing = definition.params.pacing as ExercisePacing | undefined;
	return pacing ?? DEFAULT_PACING;
}

/**
 * Where an exercise's target falls in its bar (`params.targetBarOffset`, a fraction of a whole
 * note written as text, "1/4" for beat 2 in quarters); undefined when it writes none: the downbeat.
 */
export function targetBarOffsetOf(definition: ExerciseDefinition): Fraction | undefined {
	const written = definition.params.targetBarOffset;
	return written === undefined ? undefined : Fraction.parse(String(written));
}

/** Where the counted bar ends: on the prompt, or on the target. */
export type CountEnd = 'prompt' | 'target';

/**
 * Where an exercise's counted bar ends (`params.countEndsOn`): on the prompt, as the notes have
 * always counted, or on the target; undefined when it writes none: on the prompt.
 */
export function countEndsOnOf(definition: ExerciseDefinition): CountEnd | undefined {
	return definition.params.countEndsOn as CountEnd | undefined;
}

/** The pacing the old one-answer relations read: the breath, and the leads of a ladder. Until H5. */
export interface BeatPacing extends ExercisePacing {
	/** Longest first. */
	leadSteps: readonly LeadBeats[];
}

/** The old relations' default pacing: `LEAD_STEPS` and the default breath. Until H5. */
export const DEFAULT_BEAT_PACING: BeatPacing = { ...DEFAULT_PACING, leadSteps: LEAD_STEPS };

/** An exercise's pacing for the old triad path, its leads read from its written ladder. Until H5. */
export function beatPacingOf(definition: ExerciseDefinition): BeatPacing {
	return { ...pacingOf(definition), leadSteps: leadStepsOf(definition) };
}
