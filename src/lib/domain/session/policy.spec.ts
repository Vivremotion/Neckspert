import { describe, expect, it } from 'vitest';
import type { Level, LevelState } from '$lib/domain/time';
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

const LEVELS: Level[] = [{ params: {} }, { params: {} }, { params: {} }];

function rules(overrides: Partial<SeriesRules> = {}): SeriesRules {
	return {
		levels: LEVELS,
		roundsPerBreath: () => 4,
		listen: () => true,
		budgetMs: SESSION_MS,
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

function playing(level = 0, overrides: Partial<SeriesState> = {}): SeriesState {
	return { ...startRun(startSeries(levelState(level))), ...overrides };
}

describe('next', () => {
	it('plays rounds up to the breath', () => {
		let state = playing();
		for (let i = 0; i < 4; i++) {
			const step = next(state, rules(), 0, CHAINS);
			expect(step.next).toEqual({ role: 'round' });
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
		expect(step.next).toEqual({ role: 'listen' });
		expect(step.state.run?.played).toBe(0);
		expect(next(step.state, rules(), 0, CHAINS).next.role).toBe('round');
	});

	it('a listen asked at a level that offers none is ignored', () => {
		const r = rules({ listen: () => false });
		expect(next(askListen(playing(), r), r, 0, CHAINS).next.role).toBe('round');
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
		expect(opening.next).toEqual({ role: 'round' });
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
	});
});

describe('settle', () => {
	it('moves levels as nextLevelState does', () => {
		let state = playing(0);
		let changed: 'up' | 'down' | null = null;
		for (let i = 0; i < 3; i++)
			({ state, changed } = settle(state, rules(), { level: 0, success: true }));
		expect(changed).toBe('up');
		expect(state.levelState.level).toBe(1);
	});

	it('a round of another level than the one held changes nothing', () => {
		const before = playing(1);
		const { state, changed } = settle(before, rules(), { level: 0, success: false });
		expect(state).toEqual(before);
		expect(changed).toBeNull();
	});

	it('six failures in a row at the lowest level bring only rounds and breaths', () => {
		const r = rules();
		let state = playing(0);
		for (let i = 0; i < 6; i++) {
			const step = next(state, r, 0, CHAINS);
			expect(['round', 'breath']).toContain(step.next.role);
			state = step.next.role === 'breath' ? startRun(step.state) : step.state;
			if (step.next.role === 'breath') {
				const round = next(state, r, 0, CHAINS);
				expect(round.next).toEqual({ role: 'round' });
				state = round.state;
			}
			const settled = settle(state, r, { level: 0, success: false });
			expect(settled.changed).toBeNull();
			state = settled.state;
		}
		const after = next(state, r, 0, CHAINS);
		expect(['round', 'breath']).toContain(after.next.role);
		// The state keeps only the level's run of failures, nothing else.
		expect(state).toEqual({
			levelState: { ...levelState(0), failures: 6 },
			run: { level: 0, played: 2 },
			listenAsked: false
		});
	});

	it('a listen the player asks, then three successes: the level goes up', () => {
		const r = rules();
		const heard = next(askListen(playing(0), r), r, 0, CHAINS);
		expect(heard.next).toEqual({ role: 'listen' });
		let state = heard.state;
		let changed: 'up' | 'down' | null = null;
		for (let i = 0; i < 3; i++) {
			const step = next(state, r, 0, CHAINS);
			expect(step.next).toEqual({ role: 'round' });
			({ state, changed } = settle(step.state, r, { level: 0, success: true }));
		}
		expect(changed).toBe('up');
		expect(state.levelState.level).toBe(1);
	});

	it('moves at a level that is not the first as at the first', () => {
		let state = playing(1);
		let changed: 'up' | 'down' | null = null;
		for (let i = 0; i < 2; i++)
			({ state, changed } = settle(state, rules(), { level: 1, success: false }));
		expect(changed).toBe('down');
		expect(state.levelState.level).toBe(0);
	});
});
