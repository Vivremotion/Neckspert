/**
 * The round of an exercise, written as data: what a round expects, where, how it is paired and
 * how long it lasts. `compileRound` turns it into a `RoundPlan` for one item. Pure data, JSON as is.
 */

/** A number: written, read in the item's resolved params by path, or measured on the item. */
export type Num = number | { param: string } | { item: string };

/** A place in the round from its start (the target), in beats of the meter or in bars. */
export type Position = { beats: Num } | { bars: Num };

export type WindowTemplate = { ms: Num } | { ofGap: string };

export interface ExpectationTemplate {
	/** null: free time. */
	at: Position | null;
	/** A stretch ending there; absent: a point. */
	until?: Position;
	role?: 'target' | 'judged-rest';
	sensor: string;
	/** Derived from the item by a named derivation (its kind is the derivation's); null: rhythm only. */
	content: { from: string } | null;
	window: WindowTemplate;
	bar?: number;
}

export interface RoundTemplate {
	/** The prompt `lead` beats before the target. */
	prompt: { lead: Num };
	expectations: ExpectationTemplate[];
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
