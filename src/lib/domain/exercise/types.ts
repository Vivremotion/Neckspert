import type { Figure, Level, Meter } from '$lib/domain/time';
import type { LevelOverrides } from './levels';
import type { RoundTemplate } from './round/types';
import type { PassagesTemplate } from './passage/types';
import type { ChordDiagramStyle, LeadBeats } from '$lib/domain/types';
import type { SkillId } from '$lib/domain/skill/types';

export type ExerciseId = string;

/** Lane and clicks for the guitar; answer pad and silence for the screen. */
export type Scene = 'guitar' | 'screen';

/** How a session plays an exercise's rounds; what it leaves out, its presenter gives. */
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
	/**
	 * When its instruction (`howTo`) is told: before its first round in every series
	 * (`'each-series'`, the default), or only while the player has no attempt of it
	 * (`'first-encounter'`).
	 */
	briefing?: ExerciseBriefing;
	/**
	 * When a level reached applies: after the run, at its breath (`'breath'`, the default), or at
	 * the next round chained when the level keeps the tempo (`'next-round'`, a level of another
	 * tempo still waiting for the breath).
	 */
	levelChange?: LevelChange;
	/**
	 * Whether the first encounter makes its content heard before it is played, over a longer
	 * listen-in; absent: yes. It lasts as long as the content does.
	 */
	demonstration?: boolean;
}

/** When an exercise's instruction is told (`ExerciseFlow.briefing`). */
export type ExerciseBriefing = 'each-series' | 'first-encounter';

/** When a level reached applies (`ExerciseFlow.levelChange`). */
export type LevelChange = 'breath' | 'next-round';

/** Every value of `ExerciseFlow.briefing`. */
export const BRIEFINGS: readonly ExerciseBriefing[] = ['each-series', 'first-encounter'];

export const LEVEL_CHANGES: readonly LevelChange[] = ['breath', 'next-round'];

/** Text with `{field}` placeholders: one for every language, or one per language. */
export type Slot = string | { fr: string; en: string };

/**
 * What the screen says of a prompt, as data: each slot is text with `{field}` placeholders, the
 * fields being those its set's items offer (`ITEM_FIELDS`). Pictures are named
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

/**
 * A shape: a suite of notes, each on its own string, written once and moved from chord to chord;
 * plain data, like the rest of a definition. `symbol` is what the chord's name adds to its first
 * note.
 */
export interface ExerciseShape {
	id: string;
	symbol: string;
	/** As written: `name` spells the note, so the shape keeps its spelling when it moves. */
	notes: { midi: number; string: number; name: string }[];
}

/** An exercise is data only: the skill it practises plus its parameters. */
export interface ExerciseDefinition {
	id: ExerciseId;
	/** The skill it practises, a registered one. */
	practices: SkillId;
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
	/** Its scene, preview and contest, over its presenter's defaults. */
	flow?: ExerciseFlow;
	/** What a round of this exercise expects, as data; compiled to a plan per item (`compileRound`). */
	round?: RoundTemplate;
	/** What the screen says of one of its prompts; see `presentPrompt`. */
	presentation?: PromptPresentation;
	/** The play view that shows its presenter's screen model, when the presenter gives one. */
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
	/** The figures it plays, written once in the exercise. */
	figures?: readonly { id: string; figure: Figure }[];
	/** The shapes its items move, written once (the set `placed-shape`). */
	shapes?: readonly ExerciseShape[];
	/** Which figure comes at each cycle: the same again (`loop`) or the next one (`next`). */
	pick?: 'loop' | 'next';
	/**
	 * The items an exercise session serves, in order and again from the first: keys of its
	 * set's items (`parseItem`), each alone or with the length of its turn; absent: its
	 * figures, one per turn (`pick`).
	 */
	items?: readonly ItemEntry[];
	/** The passages it plays, each member of a passage the item of a round; never with `items`. */
	passages?: PassagesTemplate;
}

/**
 * An item an exercise lists: its key, or its key and the length in beats of its turn (read by a
 * round as `{ item: 'beats' }`), which the key never holds.
 */
export type ItemEntry = string | { readonly item: string; readonly beats: number };

/** One run of an exercise (or of one scope of it); a null tempo means its rounds have none (free time). */
export interface Execution {
	exerciseId: ExerciseId;
	/** The scope of its exercise level (a grid); its prompts carry it as `PlannedItem.scope`. */
	scope?: string;
	tempoBpm: number | null;
}

/**
 * The pace of an exercise: the bars of breathing after a target, and the runs of a series (decision
 * D7 of plan H6): how many rounds a run plays before its breath, and how long that breath lasts at
 * least.
 */
export interface ExercisePacing {
	respirationBars: number;
	/** Rounds a run plays before its breath; absent: a run ends only before a counted bar. */
	roundsPerBreath?: number;
	/** The shortest breath between two runs, in ms, rounded up to whole bars; absent: 0. */
	breathMinMs?: number;
	/** Bars of accompaniment alone before a run's counted bar; absent: 0. */
	listenInBars?: number;
	/** A counted bar (every beat clicked, countdown shown) before a run; absent: true. */
	countIn?: boolean;
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
