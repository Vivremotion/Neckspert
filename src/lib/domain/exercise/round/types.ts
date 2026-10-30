/**
 * The round of an exercise, written as data: what a round expects, where, how it is paired and
 * how long it lasts. `compileRound` turns it into a `RoundPlan` for one item. Pure data, JSON as is.
 */
import type { Accompaniment } from '../../time/accompaniment';

/** A number: written, read in the item's resolved params by path, or measured on the item. */
export type Num = number | { param: string } | { item: string };

/** A place in the round from its start (the target), in beats of the meter or in bars. */
export type Position = { beats: Num } | { bars: Num };

/**
 * How far from its place an attack still counts: in ms, a share of the local gap, or the window
 * object (`{ ms }` or `{ ofGap }`) a param holds.
 */
export type WindowTemplate = { ms: Num } | { ofGap: string } | { param: string };

/** One expectation at a place. */
export interface PointExpectationTemplate {
	/** null: free time. */
	at: Position | null;
	/** A stretch ending there; absent: a point. */
	until?: Position;
	role?: 'target' | 'judged-rest';
	sensor: string;
	/**
	 * Derived from the item by a named derivation that gives one content (its kind is the
	 * derivation's); null: rhythm only.
	 */
	content: { from: string } | null;
	window: WindowTemplate;
	bar?: number;
}

/**
 * A figure among the exercise's `figures`: named by its id, by the id a param holds (so a level
 * may change it), or by the id an item names (`ITEM_FIGURES`).
 */
export type FigureRef = { id: string } | { param: string } | { item: string };

/**
 * A figure looped from `at` to the end of the round: one expectation per note played (a tie
 * prolongs, a rest expects nothing).
 */
export interface FigureExpectationTemplate {
	figure: FigureRef;
	at: Position;
	sensor: string;
	/**
	 * What each note played must play: nothing (null), the pitch written in the figure
	 * (`{ from: 'figure' }`), or an element of the list a derivation gives, the `k`-th note taking
	 * element `pattern[k mod pattern.length]` (from 1; no pattern: the list in order, looped).
	 */
	content: null | { from: string; pattern?: number[] };
	window: WindowTemplate;
}

export type ExpectationTemplate = PointExpectationTemplate | FigureExpectationTemplate;

/** The content of a figure entry that reads the pitches written in its figure. */
export const FIGURE_CONTENT = 'figure';

export interface RoundTemplate {
	/** The prompt `lead` beats before the target; absent: the round has no prompt. */
	prompt?: { lead: Num };
	expectations: ExpectationTemplate[];
	/**
	 * What plays under the round (the run's, at its exercise level), written or read in the
	 * params; its off bars give the muted bars when `mutedBars` is absent.
	 */
	accompaniment?: Accompaniment | { param: string };
	/** Bars and beats added, plus the exercise's breath (`pacing.respirationBars` bars) when `breath`. */
	length: { bars?: Num; beats?: Num; breath?: boolean };
	/** Stops listening this long before the end (the next prompt's preview); absent: at the end. */
	listenBeforeEnd?: Position;
	handover?: 'end';
	mutedBars?: number[];
	/** As `RoundPolicy`; any number inside `pairing` may be a `Num`. */
	policy: {
		unit: 'response' | 'cycle';
		verdict: string;
		correction: boolean;
		pairing: { mode: string } & Record<string, unknown>;
	};
	/** Where the target falls in its bar, a fraction of a whole note ("1/4"); absent: the downbeat. */
	barOffset?: string;
	countEndsOn?: 'prompt' | 'target';
}

/** Whether an entry writes a figure rather than one place. */
export function isFigureEntry(entry: ExpectationTemplate): entry is FigureExpectationTemplate {
	return 'figure' in entry;
}
