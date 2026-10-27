import { describe, expect, it } from 'vitest';
import type { CycleFailure, CycleReport, Level, LevelState } from '$lib/domain/time';
import { BLOCK_REST_MS, type SettledRound } from './block';
import {
	SESSION_MS,
	askListen,
	next,
	settle,
	startRun,
	startSeries,
	type SeriesRules,
	type SeriesState
} from './policy';

const ONE_AID: Level[] = [{ params: {}, aid: true }, { params: {} }, { params: {} }];
const TWO_AIDS: Level[] = [{ params: {}, aid: true }, ...ONE_AID];
const NO_AID: Level[] = [{ params: {} }, { params: {} }];

function rules(overrides: Partial<SeriesRules> = {}): SeriesRules {
	return {
		levels: ONE_AID,
		roundsPerBreath: () => 4,
		listen: () => 'free',
		canSound: true,
		budgetMs: SESSION_MS,
		antiBlocking: true,
		...overrides
	};
}

/** The next round goes on without a gap, no counted bar asked: a round within a run. */
const CHAINS = { chains: true, countIn: false };

function levelState(level = 0): LevelState {
	return {
		exerciseId: 'x',
		scope: '',
		item: '',
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

function report(missed: number[] = []): CycleReport {
	return {
		expectations: Array.from({ length: 8 }, (_, index) => ({
			index,
			verdict: missed.includes(index) ? 'missed' : 'on-time',
			offsetMs: missed.includes(index) ? null : 0
		})),
		dropped: [],
		extra: 0,
		extraAtMs: [],
		shift: null,
		measures: {},
		latency: null
	};
}

function round(level: number, reasons: CycleFailure[], missed: number[] = []): SettledRound {
	return {
		level,
		item: 'a',
		success: reasons.length === 0,
		aided: false,
		report: report(missed),
		verdict: reasons.length === 0 ? { passed: true } : { passed: false, reasons },
		spotMs: 75
	};
}

function playing(level = 0, overrides: Partial<SeriesState> = {}): SeriesState {
	return { ...startRun(startSeries(levelState(level))), ...overrides };
}

function settleAll(state: SeriesState, r: SeriesRules, rounds: SettledRound[], now = 1000) {
	let result = { state, changed: null as 'up' | 'down' | null, acted: null as unknown };
	for (const one of rounds) result = settle(result.state, r, one, now);
	return result as ReturnType<typeof settle>;
}

describe('next', () => {
	it('plays rounds up to the breath', () => {
		let state = playing();
		for (let i = 0; i < 4; i++) {
			const step = next(state, rules(), 0, CHAINS);
			expect(step.next).toEqual({ role: 'round', aid: null, remedy: false });
			state = step.state;
		}
		const breath = next(state, rules(), 0, CHAINS);
		expect(breath.next).toEqual({ role: 'breath' });
		expect(breath.state.run).toBeNull();
	});

	it('ends with the run once the budget is spent', () => {
		let state = playing();
		for (let i = 0; i < 4; i++) {
			const step = next(state, rules(), SESSION_MS, CHAINS);
			expect(step.next.role).toBe('round');
			state = step.state;
		}
		expect(next(state, rules(), SESSION_MS, CHAINS).next).toEqual({ role: 'end', reason: 'time' });
		expect(next(state, rules(), SESSION_MS - 1, CHAINS).next).toEqual({ role: 'breath' });
	});

	it('a listen asked comes before the next round and is not counted', () => {
		const asked = askListen(playing(), rules());
		const step = next(asked, rules(), 0, CHAINS);
		expect(step.next).toEqual({ role: 'listen', remedy: false });
		expect(step.state.run?.played).toBe(0);
		expect(next(step.state, rules(), 0, CHAINS).next.role).toBe('round');
	});

	it('a listen asked at a level that offers none is ignored', () => {
		const r = rules({ listen: () => 'none' });
		expect(next(askListen(playing(), r), r, 0, CHAINS).next.role).toBe('round');
	});

	it('remedies come first, one per round', () => {
		const state = playing(0, { remedies: ['listen', 'play-along'] });
		const first = next(state, rules(), 0, CHAINS);
		expect(first.next).toEqual({ role: 'listen', remedy: true });
		const second = next(first.state, rules(), 0, CHAINS);
		expect(second.next).toEqual({ role: 'round', aid: 'play-along', remedy: true });
		expect(second.state.run?.played).toBe(1);
		expect(next(second.state, rules(), 0, CHAINS).next).toEqual({
			role: 'round',
			aid: null,
			remedy: false
		});
	});

	it('ends a run after roundsPerBreath rounds', () => {
		const r = rules({ roundsPerBreath: (level) => (level === 0 ? 2 : 5) });
		let state = playing();
		for (let i = 0; i < 2; i++) {
			const step = next(state, r, 0, CHAINS);
			expect(step.next.role).toBe('round');
			state = step.state;
		}
		const breath = next(state, r, 0, CHAINS);
		expect(breath.next).toEqual({ role: 'breath' });
		expect(breath.state.run).toBeNull();
	});

	it('ends a run when the coming item asks a counted bar', () => {
		const r = rules({ roundsPerBreath: () => null });
		const first = next(playing(), r, 0, CHAINS);
		expect(first.next.role).toBe('round');
		const breath = next(first.state, r, 0, { chains: false, countIn: true });
		expect(breath.next).toEqual({ role: 'breath' });
		expect(breath.state.run).toBeNull();
		// A run that has played nothing yet is not ended by the count that opens it.
		const opening = next(startRun(breath.state), r, 0, { chains: false, countIn: true });
		expect(opening.next).toEqual({ role: 'round', aid: null, remedy: false });
	});

	it('never ends a run on roundsPerBreath null while rounds chain', () => {
		const r = rules({ roundsPerBreath: () => null });
		let state = playing();
		for (let i = 0; i < 100; i++) {
			const step = next(state, r, 0, CHAINS);
			expect(step.next.role).toBe('round');
			state = step.state;
		}
		// Placed after the breath of its plan, without a count: still the same run.
		const after = next(state, r, 0, { chains: false, countIn: false });
		expect(after.next.role).toBe('round');
		expect(after.state.run?.played).toBe(101);
	});

	it('ends the series at the first boundary after its length where the next round does not chain', () => {
		const r = rules({ roundsPerBreath: () => null, budgetMs: 1000 });
		const chained = next(playing(), r, 1000, CHAINS);
		expect(chained.next.role).toBe('round');
		expect(next(chained.state, r, 1000, { chains: false, countIn: false }).next).toEqual({
			role: 'end',
			reason: 'time'
		});
		expect(next(chained.state, r, 999, { chains: false, countIn: false }).next.role).toBe('round');
	});

	it('ends the series when the source has nothing more', () => {
		expect(next(playing(), rules(), 0, null).next).toEqual({ role: 'end', reason: 'complete' });
		const ending = playing(0, { ending: 'change-of-air' });
		expect(next(ending, rules(), 0, null).next).toEqual({ role: 'end', reason: 'change-of-air' });
	});

	it('change of air ends at the next boundary', () => {
		const state = playing(0, { ending: 'change-of-air' });
		expect(next(state, rules(), 0, CHAINS).next).toEqual({ role: 'end', reason: 'change-of-air' });
	});
});

describe('settle', () => {
	it('moves levels as nextLevelState does', () => {
		const { state, changed } = settleAll(playing(0), rules(), [
			round(0, []),
			round(0, []),
			round(0, [])
		]);
		expect(changed).toBe('up');
		expect(state.levelState.level).toBe(1);
	});

	it('a round of another level than the one held changes nothing', () => {
		const before = playing(1);
		const { state, acted } = settle(before, rules(), round(0, ['hold']), 0);
		expect(state).toEqual(before);
		expect(acted).toBeNull();
	});

	it('reading at level 1 queues a listen then a play-along', () => {
		const { state, acted } = settleAll(playing(0), rules(), [
			round(0, ['missed'], [3]),
			round(0, ['regularity']),
			round(0, ['missed'], [3])
		]);
		expect(acted).toEqual({ diagnosis: 'reading', act: 'listen-then-play-along' });
		expect(state.remedies).toEqual(['listen', 'play-along']);
		expect(state.remedied).toBe(true);
		expect(state.levelState.failures).toBe(0);
		expect(state.levelState.level).toBe(0);
	});

	it('reading without sound goes to the aid level', () => {
		const { state, acted } = settleAll(playing(0), rules({ canSound: false }), [
			round(0, ['missed'], [3]),
			round(0, ['regularity']),
			round(0, ['missed'], [3])
		]);
		expect(acted).toEqual({ diagnosis: 'reading', act: 'aid-level' });
		expect(state.levelState.level).toBe(-1);
	});

	it('unclear queues a listen, then the aid level', () => {
		const first = settleAll(playing(0), rules(), [
			round(0, ['missed'], [1]),
			round(0, ['regularity']),
			round(0, ['regularity'])
		]);
		expect(first.acted).toEqual({ diagnosis: 'unclear', act: 'listen' });
		expect(first.state.remedies).toEqual(['listen']);
		const second = settleAll(first.state, rules(), [
			round(0, ['hold']),
			round(0, ['hold']),
			round(0, ['hold'])
		]);
		expect(second.acted).toEqual({ diagnosis: null, act: 'aid-level' });
		expect(second.state.levelState.level).toBe(-1);
	});

	it('execution goes to the aid level at once', () => {
		const { state, acted } = settleAll(playing(0), rules(), [
			round(0, ['regularity']),
			round(0, ['regularity']),
			round(0, ['regularity'])
		]);
		expect(acted).toEqual({ diagnosis: 'execution', act: 'aid-level' });
		expect(state.levelState.level).toBe(-1);
	});

	it('the lowest aid level that blocks changes the air', () => {
		const { state, acted } = settleAll(
			playing(-1),
			rules(),
			[round(-1, ['hold']), round(-1, ['hold', 'regularity']), round(-1, ['regularity', 'hold'])],
			5000
		);
		expect(acted).toEqual({ diagnosis: null, act: 'change-of-air' });
		expect(state.ending).toBe('change-of-air');
		expect(state.breaking).toBe('hold');
		expect(state.levelState.failures).toBe(0);
		expect(state.levelState.resumeAfter).toBe(5000 + BLOCK_REST_MS);
	});

	it('failures stored from earlier sessions do not block on a first miss', () => {
		const stored = startRun(startSeries({ ...levelState(-1), failures: 12 }));
		const { state, acted } = settle(stored, rules(), round(-1, ['hold']), 0);
		expect(acted).toBeNull();
		expect(state.ending).toBeNull();
		const atOne = startRun(startSeries({ ...levelState(0), failures: 12 }));
		expect(settle(atOne, rules(), round(0, ['regularity']), 0).acted).toBeNull();
	});

	it('once the air changes, later rounds move nothing', () => {
		const ending = playing(-1, { ending: 'change-of-air' });
		const { state, acted } = settle(ending, rules(), round(-1, ['hold']), 0);
		expect(state).toEqual(ending);
		expect(acted).toBeNull();
	});

	it('an aid level above the lowest goes one deeper', () => {
		const { state, acted } = settleAll(playing(-1), rules({ levels: TWO_AIDS }), [
			round(-1, ['hold']),
			round(-1, ['hold']),
			round(-1, ['hold'])
		]);
		expect(acted).toEqual({ diagnosis: null, act: 'aid-level' });
		expect(state.levelState.level).toBe(-2);
	});

	it('without aid levels execution changes the air', () => {
		const { state, acted } = settleAll(playing(0), rules({ levels: NO_AID }), [
			round(0, ['regularity']),
			round(0, ['regularity']),
			round(0, ['regularity'])
		]);
		expect(acted).toEqual({ diagnosis: 'execution', act: 'change-of-air' });
		expect(state.ending).toBe('change-of-air');
	});

	it('acts the anti-blocking only when the rules ask it', () => {
		const rounds = [round(0, ['regularity']), round(0, ['regularity']), round(0, ['regularity'])];
		const asked = settleAll(playing(0), rules(), rounds);
		expect(asked.acted).toEqual({ diagnosis: 'execution', act: 'aid-level' });
		const never = settleAll(playing(0), rules({ antiBlocking: false }), [...rounds, ...rounds]);
		expect(never.acted).toBeNull();
		expect(never.state.levelState).toMatchObject({ level: 0, failures: 6, resumeAfter: null });
		expect(never.state.ending).toBeNull();
		expect(never.state.remedies).toEqual([]);
	});

	it('a level change starts the anti-blocking again', () => {
		const blocked = playing(0, { remedied: true, recent: [round(0, ['hold'])] });
		const { state } = settleAll(blocked, rules(), [round(0, []), round(0, []), round(0, [])]);
		expect(state.levelState.level).toBe(1);
		expect(state.recent).toEqual([]);
		expect(state.remedied).toBe(false);
	});
});
