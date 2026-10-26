import type { Figure, Level, LevelParams, Meter } from '$lib/domain/time';
import type { ExerciseTempo } from './tempo';
import type { ChordDiagramStyle, LeadBeats } from '$lib/domain/types';

export type MechanicId = string;
export type ExerciseId = string;

/** An exercise is data only: a mechanic plus its parameters. */
export interface ExerciseDefinition {
	id: ExerciseId;
	version: number;
	mechanic: MechanicId;
	params: Readonly<Record<string, unknown>>;
	/** Its tempo: fixed, or a range it moves within; absent: `DEFAULT_TEMPO`. */
	tempo?: ExerciseTempo;
	/** Tempo of a first execution, when the exercise wants its own (the start of its range). */
	startTempoBpm?: number;
	/** How its chord shapes are drawn, when the exercise imposes it over the player's setting. */
	chordDiagram?: ChordDiagramStyle;
	/** The meter it is played in; absent: `METER_4_4`. */
	meter?: Meter;
	/** The play view that shows its mechanic's screen model, when the mechanic gives one. */
	view?: string;
	/**
	 * What to do, told before the exercise's first prompt in a series: on the start screen when it
	 * comes first, else at a stop of its own. Data, in each language.
	 */
	howTo?: { fr: string; en: string };
	/** Its name on screen, in each language, when it is shown by name (the rhythm exercises). */
	title?: { fr: string; en: string };
	/** Rhythm exercises: the levels (aid levels first) and the params they override. */
	levels?: readonly Level[];
	base?: LevelParams;
	/** The figures it plays, written once in the catalog. */
	figures?: readonly { id: string; figure: Figure }[];
	/** Which figure comes at each cycle: the same again (`loop`) or the next one (`next`). */
	pick?: 'loop' | 'next';
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

/** The rhythm of an exercise on the beat: the bars of breathing after a target. */
export interface ExercisePacing {
	respirationBars: number;
}

/** What a level of an item changes: how long before the beat it is asked, and whether it is aided. */
export interface LadderParams {
	/** Beats of lead; null when the item has no lead (the answer is not played on a beat). */
	leadBeats: LeadBeats | null;
	aided: boolean;
}

/**
 * An item's levels, level 0 first, as its exercise writes them (`params.ladder`): each level's
 * lead and aid, its pass and drop, and what counts as a success there.
 */
export type Ladder = readonly Level<LadderParams>[];
