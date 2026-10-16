import type { Accompaniment } from './accompaniment';
import type { ExpectationWindow } from './plan';
import type { TempoSegment } from './tempoMap';

/** Successes in a row, unaided, that move an exercise up a level (a level's `pass` overrides it). */
export const PASS_AFTER_CYCLES = 3;
/** Failures in a row that move an exercise down a level (a level's `drop` overrides it). */
export const DROP_AFTER_FAILS = 2;
/** Cycles played before a breath, unless a level says otherwise. */
export const CYCLES_PER_BREATH = 4;

/** Bars of accompaniment alone (listen, do not play) before play, unless an exercise says otherwise. */
export const LISTEN_IN_BARS = 2;

export type Feedback = 'every-cycle' | 'summary' | 'out-of-tolerance';

/** Everything a level can change about how an exercise is played. */
export interface LevelParams {
	accompaniment: Accompaniment;
	cycleBars: number;
	tempo: TempoSegment;
	window: ExpectationWindow;
	feedback: Feedback;
	listen: 'free' | 'aid' | 'none';
	cursor: boolean;
	cyclesPerBreath: number;
	/** Cycles a series plays before it ends; absent: it lasts its time (`RHYTHM_SERIES_MS`). */
	cyclesPerSeries?: number;
	/** Bars of accompaniment alone before play; absent: `LISTEN_IN_BARS`. */
	listenInBars?: number;
	/** A counted bar (every beat clicked, countdown shown) after the listen-in; absent: true. */
	countIn?: boolean;
	thresholds: Partial<Record<'precision' | 'regularity' | 'holdOffset' | 'holdDrift', number>>;
}

/**
 * A level of an exercise: a partial override of the exercise's params, with its conditions
 * as data. `aid` levels sit first in the list, below level 1.
 */
export interface Level {
	params: Partial<LevelParams>;
	pass?: { successes: number };
	drop?: { failures: number };
	aid?: true;
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

export function levelRange(levels: readonly Level[]): LevelRange {
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

/** Level `index` (0 = first level, aid levels before it have negative indexes) over the exercise's base params. */
export function resolveLevel(
	base: LevelParams,
	levels: readonly Level[],
	index: number
): LevelParams {
	const { lowest, highest } = levelRange(levels);
	if (!Number.isInteger(index) || index < lowest || index > highest) {
		throw new RangeError(`level ${index} is not in ${lowest}..${highest}`);
	}
	const { thresholds, ...params } = levels[index - lowest].params;
	const resolved: LevelParams = { ...base };
	for (const key of Object.keys(params) as (keyof typeof params)[]) {
		if (params[key] !== undefined) Object.assign(resolved, { [key]: params[key] });
	}
	resolved.thresholds = { ...base.thresholds, ...thresholds };
	checkStart(resolved);
	return resolved;
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
	levels: readonly Level[],
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
