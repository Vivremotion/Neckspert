/** Successes in a row that move an exercise up a level (a level's `pass` overrides it). */
export const PASS_AFTER_CYCLES = 3;
/** Failures in a row that move an exercise down a level (a level's `drop` overrides it). */
export const DROP_AFTER_FAILS = 2;

/** Bars of accompaniment alone (listen, do not play) the transport plays when told no other. */
export const LISTEN_IN_BARS = 2;

/** How a round that plays a figure tells its marks: every cycle, a summary, or only what is out. */
export type Feedback = 'every-cycle' | 'summary' | 'out-of-tolerance';

/**
 * A level, of an exercise or of an item: a partial override of the params (dotted paths for an
 * exercise's levels, see `overrideParams`), with its conditions as data. A level is its place in
 * the list: index 0 is « niveau 1 », the top is `levels.length - 1`.
 */
export interface Level<P = Readonly<Record<string, unknown>>> {
	params: Partial<P>;
	pass?: { successes: number };
	drop?: { failures: number };
	/** What counts as a success at this level: any success (default), or a direct recall only. */
	success?: 'any' | 'direct-recall';
}

/**
 * Refuses a start the player could not use: a listen-in that is not a whole number of bars, or
 * no listen-in and no counted bar (nothing to hear before playing).
 */
export function checkStart(start: { listenInBars: number; countIn: boolean }): void {
	const { listenInBars } = start;
	if (!Number.isInteger(listenInBars) || listenInBars < 0) {
		throw new RangeError(`listenInBars must be a whole number of bars, got ${listenInBars}`);
	}
	if (!start.countIn && listenInBars === 0) {
		throw new RangeError('a series with no counted bar needs at least one listen-in bar');
	}
}

/** Where an exercise stands, per (exercise, scope, item); empty strings stand for an absent scope or item. */
export interface LevelState {
	exerciseId: string;
	scope: string;
	item: string;
	level: number;
	/** Successes in a row at this level. */
	successes: number;
	/** Failures in a row at this level. */
	failures: number;
}

/**
 * The state after one cycle: `pass` successes in a row move up a level, `drop` failures in a row
 * move down (their defaults `PASS_AFTER_CYCLES` and `DROP_AFTER_FAILS`). Going down stops at
 * level 1 (index 0), where failures keep counting. A level change starts both runs again.
 */
export function nextLevelState(
	state: LevelState,
	levels: readonly Level<unknown>[],
	cycle: { success: boolean }
): { state: LevelState; changed: 'up' | 'down' | null } {
	const highest = levels.length - 1;
	if (!Number.isInteger(state.level) || state.level < 0 || state.level > highest) {
		throw new RangeError(`level ${state.level} is not in 0..${highest}`);
	}
	const here = levels[state.level];
	if (cycle.success) {
		const successes = state.successes + 1;
		if (successes < (here.pass?.successes ?? PASS_AFTER_CYCLES)) {
			return { state: { ...state, successes, failures: 0 }, changed: null };
		}
		if (state.level >= highest) {
			return { state: { ...state, successes: 0, failures: 0 }, changed: null };
		}
		return {
			state: { ...state, level: state.level + 1, successes: 0, failures: 0 },
			changed: 'up'
		};
	}

	const failures = state.failures + 1;
	if (failures < (here.drop?.failures ?? DROP_AFTER_FAILS)) {
		return { state: { ...state, successes: 0, failures }, changed: null };
	}
	if (state.level <= 0) {
		// The floor: keep counting.
		return { state: { ...state, successes: 0, failures }, changed: null };
	}
	return {
		state: { ...state, level: state.level - 1, successes: 0, failures: 0 },
		changed: 'down'
	};
}
