import type { Figure, Level, Meter } from '$lib/domain/time';
import type { LevelOverrides } from './levels';
import type { RoundTemplate } from './round/types';
import type { ChordDiagramStyle, LeadBeats } from '$lib/domain/types';

export type MechanicId = string;
export type ExerciseId = string;

/** Lane and clicks for the guitar; answer pad and silence for the screen. */
export type Scene = 'guitar' | 'screen';

/** How a session plays an exercise's rounds; what it leaves out, its mechanic's presenter gives. */
export interface ExerciseFlow {
	/** Where it is played: the guitar (the click is heard) or the screen (silence). */
	scene?: Scene;
	/** Beats before its prompt that it is shown after a round without a counted bar. */
	previewBeats?: number;
	/** Whether a miss can be contested in play (development builds). */
	contestable?: boolean;
	/**
	 * Whether failures in a row at its first level bring the anti-blocking (a remedy, an aid
	 * level, « On change d’air »); absent: no.
	 */
	antiBlocking?: boolean;
}

/** Text with `{field}` placeholders: one for every language, or one per language. */
export type Slot = string | { fr: string; en: string };

/**
 * What the screen says of a prompt, as data: each slot is text with `{field}` placeholders, the
 * fields being those its mechanic's items offer (`ITEM_FIELDS`). Pictures are named
 * (`PICTURES`). Read by `presentPrompt`.
 */
export interface PromptPresentation {
	primary: Slot;
	secondary?: Slot;
	/** Small, under the prompt. */
	detail?: Slot;
	/** On the target tile; absent: `primary`. */
	target?: Slot;
	/** On the band of an extended expectation. */
	band?: Slot;
	/** While the item waits for its prompt; absent: nothing. */
	preview?: Slot;
	/** At an aided level: a line, a picture, or both. */
	aided?: { line?: Slot; picture?: string };
	/** The fading aid the learning procedure gives (`PlannedItem.stringAid`). */
	fading?: { picture: string };
}

/** An exercise is data only: a mechanic plus its parameters. */
export interface ExerciseDefinition {
	id: ExerciseId;
	version: number;
	mechanic: MechanicId;
	params: Readonly<Record<string, unknown>>;
	/**
	 * Its tempo, in beats of its meter per minute, before any level; absent: `DEFAULT_TEMPO_BPM`.
	 * A level may override it (`tempo`), as any other param.
	 */
	tempo?: number;
	/** How its chord shapes are drawn, when the exercise imposes it over the player's setting. */
	chordDiagram?: ChordDiagramStyle;
	/** The meter it is played in; absent: `METER_4_4`. */
	meter?: Meter;
	/** Its scene, preview and contest, over its mechanic presenter's defaults. */
	flow?: ExerciseFlow;
	/** What a round of this exercise expects, as data; compiled to a plan per item (`compileRound`). */
	round?: RoundTemplate;
	/** What the screen says of one of its prompts; see `presentPrompt`. */
	presentation?: PromptPresentation;
	/** The play view that shows its mechanic's screen model, when the mechanic gives one. */
	view?: string;
	/**
	 * What to do, told before the exercise's first prompt in a series: on the start screen when it
	 * comes first, else at a stop of its own. Data, in each language.
	 */
	howTo?: { fr: string; en: string };
	/** Its name on screen, in each language, when it is shown by name (the rhythm exercises). */
	title?: { fr: string; en: string };
	/**
	 * Its levels (aid levels first): each overrides dotted paths of its resolved params
	 * (`resolvedParamsOf`), the tempo included; absent: one level that changes nothing.
	 */
	levels?: readonly Level<LevelOverrides>[];
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
 * lead and aid, its pass and drop, and what counts as a success there. A level may override any
 * other dotted path of the resolved params too (`resolvedParamsOf`).
 */
export type Ladder = readonly Level<LadderParams & LevelOverrides>[];
