import { nextLevelState, type Level, type LevelState } from '$lib/domain/time';
import type { SeriesEnd } from './trace';

/** How long a session lasts unless it says otherwise (wall time, pauses included). */
export const SESSION_MS = 300_000;

/** What the policy reads of an exercise. */
export interface SeriesRules {
	levels: readonly Level<unknown>[];
	/** Rounds a run plays before its breath at this level; null: the items decide (a counted bar). */
	roundsPerBreath(level: number): number | null;
	/** The level lets the player ask to hear the content. */
	listen(level: number): boolean;
	/** Every run at this level opens with a heard cycle, not played nor judged. */
	listenFirst(level: number): boolean;
	/** The model sounds with the player at every round of this level. */
	playAlong(level: number): boolean;
	/** The series' length: past it, the first boundary where the next round does not chain ends it. */
	budgetMs: number;
}

export interface SeriesState {
	levelState: LevelState;
	/**
	 * The run under way; null between a breath and the next run. Its level is fixed for the run;
	 * `heard`: the cycle a `listenFirst` level opens it with was heard.
	 */
	run: { level: number; played: number; heard: boolean } | null;
	listenAsked: boolean;
}

export type Next =
	| { role: 'round'; playAlong: boolean }
	| { role: 'listen' }
	| { role: 'breath' }
	| { role: 'end'; reason: SeriesEnd };

export function startSeries(levelState: LevelState): SeriesState {
	return { levelState, run: null, listenAsked: false };
}

/** A run starts at the level held. */
export function startRun(state: SeriesState): SeriesState {
	return { ...state, run: { level: state.levelState.level, played: 0, heard: false } };
}

/** The round that comes, as the series would place it. */
export interface Coming {
	/** It goes on from the round before without a gap (a handover, nothing changed). */
	chains: boolean;
	/** A counted bar comes before it. */
	countIn: boolean;
}

/**
 * What the series plays next, at a boundary between rounds; `elapsedMs` since it began; `coming`,
 * the next item taken from its source, null when the source has nothing more (decision D7 of plan
 * H6). A run ends after `roundsPerBreath` rounds, or before an item that asks a counted bar once it
 * has played a round: a breath. Past `budgetMs`, the series ends at the first boundary where the
 * next round does not chain; a run's last round never chains to the round after its breath. A run
 * at a `listenFirst` level opens with a heard cycle (answering a listen asked meanwhile); a round
 * at a `playAlong` level carries it.
 */
export function next(
	state: SeriesState,
	rules: SeriesRules,
	elapsedMs: number,
	coming: Coming | null
): { state: SeriesState; next: Next } {
	if (!coming) return { state, next: { role: 'end', reason: 'complete' } };
	const run = state.run;
	if (!run) throw new Error('no run under way: start one first');
	const length = rules.roundsPerBreath(run.level);
	const breathes = (length !== null && run.played >= length) || (coming.countIn && run.played > 0);
	if (!(coming.chains && !breathes) && elapsedMs >= rules.budgetMs) {
		return { state, next: { role: 'end', reason: 'time' } };
	}
	if (breathes) return { state: { ...state, run: null }, next: { role: 'breath' } };
	if (run.played === 0 && !run.heard && rules.listenFirst(run.level)) {
		return {
			state: { ...state, listenAsked: false, run: { ...run, heard: true } },
			next: { role: 'listen' }
		};
	}
	if (state.listenAsked && rules.listen(run.level)) {
		return { state: { ...state, listenAsked: false }, next: { role: 'listen' } };
	}
	return {
		state: { ...state, listenAsked: false, run: { ...run, played: run.played + 1 } },
		next: { role: 'round', playAlong: rules.playAlong(run.level) }
	};
}

/** The player asked to hear the content: the next round is heard, unless the level offers no listening. */
export function askListen(state: SeriesState, rules: SeriesRules): SeriesState {
	const level = state.run?.level ?? state.levelState.level;
	if (!rules.listen(level)) return state;
	return { ...state, listenAsked: true };
}

/**
 * A round settled: the level moves as `nextLevelState` says (decision 11 of issue #19: a success
 * at a level is a success at that level). A level it changes holds from the next run.
 */
export function settle(
	state: SeriesState,
	rules: SeriesRules,
	round: { level: number; success: boolean }
): { state: SeriesState; changed: 'up' | 'down' | null } {
	// A round of another level than the one held: it was laid out before the level moved.
	if (round.level !== state.levelState.level) return { state, changed: null };
	const moved = nextLevelState(state.levelState, rules.levels, { success: round.success });
	return { state: { ...state, levelState: moved.state }, changed: moved.changed };
}
