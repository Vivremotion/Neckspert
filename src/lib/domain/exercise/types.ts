import type { ChordDiagramStyle, LeadBeats } from '$lib/domain/types';

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
	/** How its chord shapes are drawn, when the exercise imposes it over the player's setting. */
	chordDiagram?: ChordDiagramStyle;
	/** The play view that shows its mechanic's screen model, when the mechanic gives one. */
	view?: string;
}

/**
 * Tempo reached by the player on an exercise, or on one scope of it (a grid: a ballad and a blues
 * progress apart). Without a scope, the exercise's own.
 */
export interface Progression {
	exerciseId: ExerciseId;
	/** The part of the exercise the tempo belongs to; absent for the exercise as a whole. */
	scope?: string;
	mechanic: MechanicId;
	tempoBpm: number;
	updatedAt: number;
}

/** One run of an exercise (or of one scope of it); a null tempo means the mechanic has none. */
export interface Execution {
	exerciseId: ExerciseId;
	/** As `Progression.scope`; its prompts carry it as `PlannedItem.tempoScope`. */
	scope?: string;
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
