import type { Accompaniment } from './accompaniment';
import type { CycleThresholds } from './judge/measures';
import type { ExpectationWindow } from './plan';

/** Successes in a row, unaided, that move an exercise up a level (a level's `pass` overrides it). */
export const PASS_AFTER_CYCLES = 3;
/** Failures in a row that move an exercise down a level (a level's `drop` overrides it). */
export const DROP_AFTER_FAILS = 2;

/** Bars of accompaniment alone (listen, do not play) before play, unless an exercise says otherwise. */
export const LISTEN_IN_BARS = 2;

export type Feedback = 'every-cycle' | 'summary' | 'out-of-tolerance';

/** Everything a level can change about how an exercise is played. */
export interface LevelParams {
	accompaniment: Accompaniment;
	cycleBars: number;
	/** Beats per minute, the beat being the unit of the accompaniment's meter. */
	tempo: number;
	window: ExpectationWindow;
	feedback: Feedback;
	listen: 'free' | 'aid' | 'none';
	cursor: boolean;
	/** Bars of accompaniment alone before play; absent: `LISTEN_IN_BARS`. */
	listenInBars?: number;
	/** A counted bar (every beat clicked, countdown shown) after the listen-in; absent: true. */
	countIn?: boolean;
	thresholds: CycleThresholds;
}

/**
 * A level, of an exercise or of an item: a partial override of the params (dotted paths for an
 * exercise's levels, see `overrideParams`), with its conditions as data. `aid` levels sit first in
 * the list, below level 1.
 */
export interface Level<P = LevelParams> {
	params: Partial<P>;
	pass?: { successes: number };
	drop?: { failures: number };
	aid?: true;
	/** What counts as a success at this level: any success (default), or a direct recall only. */
	success?: 'any' | 'direct-recall';
}

/**
 * Levels are indexed from the first regular level: index 0 is « niveau 1 », index `i >= 0`
 * is « niveau i + 1 sur N ». Aid levels, which come first in the list, have negative
 * indexes, -1 being the one closest to level 1.
 */
export interface LevelRange {
	lowest: number;
	first: 0;
	highest: number;
}

export function levelRange(levels: readonly Level<unknown>[]): LevelRange {
	const aidCount = levels.findIndex((level) => !level.aid);
	if (aidCount < 0) throw new RangeError('an exercise needs at least one level that is not an aid');
	if (levels.slice(aidCount).some((level) => level.aid)) {
		throw new RangeError('aid levels must come before the first regular level');
	}
	return {
		lowest: aidCount === 0 ? 0 : -aidCount,
		first: 0,
		highest: levels.length - aidCount - 1
	};
}

/**
 * Refuses a start the player could not use: a listen-in that is not a whole number of bars, or
 * no listen-in and no counted bar (nothing to hear before playing).
 */
export function checkStart(params: Pick<LevelParams, 'listenInBars' | 'countIn'>): void {
	const listenInBars = params.listenInBars ?? LISTEN_IN_BARS;
	if (!Number.isInteger(listenInBars) || listenInBars < 0) {
		throw new RangeError(`listenInBars must be a whole number of bars, got ${listenInBars}`);
	}
	if (params.countIn === false && listenInBars === 0) {
		throw new RangeError('a series with no counted bar needs at least one listen-in bar');
	}
}

/** Where an exercise stands, per (exercise, scope, item); empty strings stand for an absent scope or item. */
export interface LevelState {
	exerciseId: string;
	scope: string;
	item: string;
	level: number;
	/** Unaided successes in a row at this level. */
	successes: number;
	/** Failures in a row at this level. */
	failures: number;
	resumeAfter: number | null;
}

/**
 * The state after one cycle. An aided cycle counts neither way (it only resets the run of
 * successes) and leaves the run of failures as it is. `aided` means played with an aid
 * the level itself does not give (listen, play-along, a cursor the level does not give...):
 * the aids the level gives (its cursor, an aid level's aid) do not block, so the caller passes
 * `aided: false` for a cycle whose only aid is its level's, and the player can climb out of
 * the aid levels. Going down stops at level 1: the aid levels are reached by
 * the anti-blocking of a session, never by failing. At the floor (level 0 or an aid level)
 * failures keep counting, for that anti-blocking to read, and its owner resets them. A level
 * change starts both runs again.
 */
export function nextLevelState(
	state: LevelState,
	levels: readonly Level<unknown>[],
	cycle: { success: boolean; aided: boolean }
): { state: LevelState; changed: 'up' | 'down' | null } {
	const { lowest, highest } = levelRange(levels);
	if (!Number.isInteger(state.level) || state.level < lowest || state.level > highest) {
		throw new RangeError(`level ${state.level} is not in ${lowest}..${highest}`);
	}
	const here = levels[state.level - lowest];
	if (cycle.aided) return { state: { ...state, successes: 0 }, changed: null };

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
		// The floor: keep counting, plan 2's anti-blocking reads the run and resets it when it acts.
		return { state: { ...state, successes: 0, failures }, changed: null };
	}
	return {
		state: { ...state, level: state.level - 1, successes: 0, failures: 0 },
		changed: 'down'
	};
}
