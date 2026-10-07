import type { LeadBeats } from '$lib/domain/types';

export type MechanicId = string;
export type ExerciseId = string;

/** An exercise is data only: a mechanic plus its parameters. */
export interface ExerciseDefinition {
	id: ExerciseId;
	version: number;
	mechanic: MechanicId;
	params: Readonly<Record<string, unknown>>;
	/** Tempo of a first execution, when the exercise wants its own. */
	startTempoBpm?: number;
}

/** Tempo reached by the player on an exercise. */
export interface Progression {
	exerciseId: ExerciseId;
	mechanic: MechanicId;
	tempoBpm: number;
	updatedAt: number;
}

/** One run of an exercise; a null tempo means the mechanic has none. */
export interface Execution {
	exerciseId: ExerciseId;
	tempoBpm: number | null;
}

/**
 * The rhythm of an exercise on the beat: the lead ladder of its prompts, the bars of breathing
 * after a target, and the successes at the shortest lead that make an item learned.
 */
export interface ExercisePacing {
	/** Longest first; each step one of LEAD_STEPS. */
	leadSteps: readonly LeadBeats[];
	respirationBars: number;
	learnedAfter: number;
}
