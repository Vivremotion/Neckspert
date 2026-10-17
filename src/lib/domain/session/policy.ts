import {
	levelRange,
	nextLevelState,
	type CycleFailure,
	type Level,
	type LevelParams,
	type LevelState
} from '$lib/domain/time';
import {
	BLOCK_AFTER_FAILS,
	BLOCK_REST_MS,
	breakingMeasure,
	diagnoseBlock,
	type BlockDiagnosis,
	type SettledRound
} from './block';
import type { SeriesEnd } from './trace';

/** How long a session lasts unless it says otherwise (wall time, pauses included). */
export const SESSION_MS = 300_000;

/** What the anti-blocking gives before an aid level: the content heard, then played along. */
export type Remedy = 'listen' | 'play-along';

/** What the policy reads of an exercise. */
export interface SeriesRules {
	levels: readonly Level[];
	params(level: number): Pick<LevelParams, 'cyclesPerBreath' | 'listen'>;
	/** The exercise can make its content sound (a figure): listening and playing along are remedies. */
	canSound: boolean;
	budgetMs: number;
}

export interface SeriesState {
	levelState: LevelState;
	/** The run under way; null between a breath and the next run. Its level is fixed for the run. */
	run: { level: number; played: number } | null;
	listenAsked: boolean;
	/** Queued by the anti-blocking, taken by `next` one per round. */
	remedies: Remedy[];
	/** The floor's remedy was given since this level's run of failures began. */
	remedied: boolean;
	/** Rounds settled at the level held since its last unaided success, newest last. */
	recent: SettledRound[];
	ending: SeriesEnd | null;
	/** The measure that breaks, once « On change d’air » is decided. */
	breaking: CycleFailure | null;
}

export type Next =
	| { role: 'round'; aid: 'play-along' | null; remedy: boolean }
	| { role: 'listen'; remedy: boolean }
	| { role: 'breath' }
	| { role: 'end'; reason: SeriesEnd };

export type BlockAct = {
	diagnosis: BlockDiagnosis | null;
	act: 'listen' | 'listen-then-play-along' | 'aid-level' | 'change-of-air';
};

export function startSeries(levelState: LevelState): SeriesState {
	return {
		levelState,
		run: null,
		listenAsked: false,
		remedies: [],
		remedied: false,
		recent: [],
		ending: null,
		breaking: null
	};
}

/** A run starts at the level held. */
export function startRun(state: SeriesState): SeriesState {
	return { ...state, run: { level: state.levelState.level, played: 0 } };
}

/** What the series plays next, at a boundary between rounds; `elapsedMs` since it began. */
export function next(
	state: SeriesState,
	rules: SeriesRules,
	elapsedMs: number
): { state: SeriesState; next: Next } {
	if (state.ending) return { state, next: { role: 'end', reason: state.ending } };
	const run = state.run;
	if (!run) throw new Error('no run under way: start one first');
	if (run.played >= rules.params(run.level).cyclesPerBreath) {
		if (elapsedMs >= rules.budgetMs) return { state, next: { role: 'end', reason: 'time' } };
		return { state: { ...state, run: null }, next: { role: 'breath' } };
	}
	const [remedy, ...rest] = state.remedies;
	if (remedy === 'listen') {
		return { state: { ...state, remedies: rest }, next: { role: 'listen', remedy: true } };
	}
	if (remedy === 'play-along') {
		return {
			state: { ...state, remedies: rest, run: { ...run, played: run.played + 1 } },
			next: { role: 'round', aid: 'play-along', remedy: true }
		};
	}
	if (state.listenAsked && rules.params(run.level).listen !== 'none') {
		return { state: { ...state, listenAsked: false }, next: { role: 'listen', remedy: false } };
	}
	return {
		state: { ...state, listenAsked: false, run: { ...run, played: run.played + 1 } },
		next: { role: 'round', aid: null, remedy: false }
	};
}

/** The player asked to hear the content: the next round is heard, unless the level offers no listening. */
export function askListen(state: SeriesState, rules: SeriesRules): SeriesState {
	const level = state.run?.level ?? state.levelState.level;
	if (rules.params(level).listen === 'none') return state;
	return { ...state, listenAsked: true };
}

/**
 * A round settled: the level moves as `nextLevelState` says; at the floor, `BLOCK_AFTER_FAILS`
 * failures in a row bring the anti-blocking (spec amendment 2026-10-17): at level 1 a remedy
 * once (by `diagnoseBlock`), then the aid level, one deeper at each block, and below the lowest
 * « On change d’air ». A level it changes holds from the next run.
 */
export function settle(
	state: SeriesState,
	rules: SeriesRules,
	round: SettledRound,
	nowMs: number
): { state: SeriesState; changed: 'up' | 'down' | null; acted: BlockAct | null } {
	// A round of another level, or one judged after « On change d’air »: the exercise rests as left.
	if (round.level !== state.levelState.level || state.ending === 'change-of-air') {
		return { state, changed: null, acted: null };
	}
	const moved = nextLevelState(state.levelState, rules.levels, {
		success: round.success,
		aided: round.aided
	});
	if (moved.changed) {
		return {
			state: { ...state, levelState: moved.state, recent: [], remedied: false },
			changed: moved.changed,
			acted: null
		};
	}
	const recent =
		round.success && !round.aided ? [] : [...state.recent, round].slice(-BLOCK_AFTER_FAILS);
	const held: SeriesState = { ...state, levelState: moved.state, recent };
	const { level, failures } = held.levelState;
	// The run of failures must be this series' own: failures stored from earlier sessions count
	// for the level, never alone for the anti-blocking.
	if (failures < BLOCK_AFTER_FAILS || recent.length < BLOCK_AFTER_FAILS || level > 0) {
		return { state: held, changed: null, acted: null };
	}

	if (level === 0 && !held.remedied) {
		const diagnosis = diagnoseBlock(recent);
		const remedies: Remedy[] | null =
			diagnosis === 'reading' && rules.canSound
				? ['listen', 'play-along']
				: diagnosis === 'unclear' && rules.canSound
					? ['listen']
					: null;
		if (remedies) {
			return {
				state: {
					...held,
					remedies,
					remedied: true,
					recent: [],
					levelState: { ...held.levelState, failures: 0 }
				},
				changed: null,
				acted: { diagnosis, act: remedies.length === 2 ? 'listen-then-play-along' : 'listen' }
			};
		}
		return deeper(held, rules, diagnosis, nowMs);
	}
	return deeper(held, rules, null, nowMs);
}

/** One aid level deeper, or « On change d’air » below the lowest. */
function deeper(
	state: SeriesState,
	rules: SeriesRules,
	diagnosis: BlockDiagnosis | null,
	nowMs: number
): { state: SeriesState; changed: null; acted: BlockAct } {
	const { lowest } = levelRange(rules.levels);
	const { level } = state.levelState;
	if (level > lowest) {
		return {
			state: {
				...state,
				recent: [],
				remedied: false,
				levelState: { ...state.levelState, level: level - 1, successes: 0, failures: 0 }
			},
			changed: null,
			acted: { diagnosis, act: 'aid-level' }
		};
	}
	return {
		state: {
			...state,
			ending: 'change-of-air',
			breaking: breakingMeasure(state.recent),
			levelState: {
				...state.levelState,
				successes: 0,
				failures: 0,
				resumeAfter: nowMs + BLOCK_REST_MS
			}
		},
		changed: null,
		acted: { diagnosis, act: 'change-of-air' }
	};
}
