import { describe, expect, it } from 'vitest';
import {
	DROP_AFTER_FAILS,
	PASS_AFTER_CYCLES,
	nextLevelState,
	checkStart,
	type Level,
	type LevelState
} from './levels';

const plain: Level[] = [{ params: {} }, { params: {} }, { params: {} }];

function stateAt(level: number, extra: Partial<LevelState> = {}): LevelState {
	return {
		exerciseId: 'ex',
		scope: '',
		item: '',
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null,
		...extra
	};
}

const ok = { success: true };
const ko = { success: false };

/** Plays the results in order; returns the final state and the cycle index of each change. */
function play(start: LevelState, levels: readonly Level[], results: (typeof ok)[]) {
	let state = start;
	const changes: { at: number; changed: 'up' | 'down' }[] = [];
	results.forEach((cycle, at) => {
		const next = nextLevelState(state, levels, cycle);
		state = next.state;
		if (next.changed) changes.push({ at, changed: next.changed });
	});
	return { state, changes };
}

describe('level constants', () => {
	it('names the defaults', () => {
		expect([PASS_AFTER_CYCLES, DROP_AFTER_FAILS]).toEqual([3, 2]);
	});
});

describe('checkStart', () => {
	it('refuses a start with no listen-in and no counted bar, or a listen-in that is not whole', () => {
		const at = (listenInBars: number, countIn: boolean) => () =>
			checkStart({ listenInBars, countIn });
		expect(at(0, false)).toThrow(RangeError);
		expect(at(-1, true)).toThrow(RangeError);
		expect(at(1.5, true)).toThrow(RangeError);
		expect(at(0, true)).not.toThrow();
		expect(at(1, false)).not.toThrow();
	});
});

describe('nextLevelState', () => {
	it('goes up after three successes in a row', () => {
		const { state, changes } = play(stateAt(0), plain, [ok, ok, ok]);
		expect(changes).toEqual([{ at: 2, changed: 'up' }]);
		expect(state).toMatchObject({ level: 1, successes: 0, failures: 0 });
	});

	it('goes up once, at the right cycle, for 2 successes, a failure, then 3 successes', () => {
		const { state, changes } = play(stateAt(0), plain, [ok, ok, ko, ok, ok, ok]);
		expect(changes).toEqual([{ at: 5, changed: 'up' }]);
		expect(state.level).toBe(1);
	});

	it('goes down after two failures in a row', () => {
		const { state, changes } = play(stateAt(1), plain, [ko, ko]);
		expect(changes).toEqual([{ at: 1, changed: 'down' }]);
		expect(state).toMatchObject({ level: 0, successes: 0, failures: 0 });
	});

	it('a success between failures keeps the level', () => {
		const { state, changes } = play(stateAt(1), plain, [ko, ok, ko]);
		expect(changes).toEqual([]);
		expect(state.level).toBe(1);
	});

	it('stays at level 0 after two failures', () => {
		const { state, changes } = play(stateAt(0), plain, [ko, ko, ko, ko]);
		expect(changes).toEqual([]);
		expect(state.level).toBe(0);
	});

	it('takes three failures at the second level of a changes exercise back to the first', () => {
		// As the changes write it: a first level with the defaults, a second dropped after 3 misses.
		const levels: Level[] = [
			{ params: { tempo: 80 } },
			{ params: { tempo: 80 }, pass: { successes: 10 }, drop: { failures: 3 } },
			{ params: { tempo: 85 } }
		];
		const { state, changes } = play(stateAt(1), levels, [ko, ko, ko]);
		expect(changes).toEqual([{ at: 2, changed: 'down' }]);
		expect(state).toMatchObject({ level: 0, successes: 0, failures: 0 });
	});

	it('stays at the highest level after three successes', () => {
		const { state, changes } = play(stateAt(2), plain, [ok, ok, ok, ok]);
		expect(changes).toEqual([]);
		expect(state.level).toBe(2);
	});

	it('reads pass and drop conditions from the level it stands on', () => {
		const levels: Level[] = [
			{ params: {}, pass: { successes: 1 } },
			{ params: {}, drop: { failures: 3 }, pass: { successes: 5 } },
			{ params: {} }
		];
		expect(play(stateAt(0), levels, [ok]).state.level).toBe(1);
		expect(play(stateAt(1), levels, [ko, ko]).state.level).toBe(1);
		expect(play(stateAt(1), levels, [ko, ko, ko]).state.level).toBe(0);
		expect(play(stateAt(1), levels, [ok, ok, ok, ok]).state.level).toBe(1);
		expect(play(stateAt(1), levels, [ok, ok, ok, ok, ok]).state.level).toBe(2);
	});

	it('keeps counting failures at the floor', () => {
		const { state, changes } = play(stateAt(0), plain, [ko, ko, ko, ko]);
		expect(changes).toEqual([]);
		expect(state).toMatchObject({ level: 0, failures: 4, successes: 0 });
	});

	it('keeps identity and resumeAfter, and does not mutate the input', () => {
		const start = stateAt(0, { resumeAfter: 7, scope: 'blues', item: 'a' });
		const frozen = Object.freeze({ ...start });
		const next = nextLevelState(frozen, plain, ok);
		expect(next.state).toMatchObject({
			exerciseId: 'ex',
			scope: 'blues',
			item: 'a',
			resumeAfter: 7
		});
		expect(next.state).not.toBe(frozen);
		expect(frozen.successes).toBe(0);
	});

	it('rejects a state whose level is outside the ladder: below the first or above the top', () => {
		expect(() => nextLevelState(stateAt(5), plain, ok)).toThrow(RangeError);
		expect(() => nextLevelState(stateAt(3), plain, ok)).toThrow(RangeError);
		expect(() => nextLevelState(stateAt(-1), plain, ok)).toThrow(RangeError);
		expect(() => nextLevelState(stateAt(0), [], ok)).toThrow(RangeError);
	});

	it('reads a level by its place in the list, whatever it writes', () => {
		// A first level that writes `aid` is a level like the others: its own pass condition moves it.
		const levels = [
			{ params: {}, aid: true, pass: { successes: 1 } },
			{ params: {} }
		] as unknown as Level[];
		expect(play(stateAt(0), levels, [ok]).state.level).toBe(1);
		expect(play(stateAt(1), levels, [ko, ko]).state.level).toBe(0);
	});
});

describe('generic levels', () => {
	it('moves any ladder of levels, not only the rhythm’s', () => {
		const ladder: Level<{ leadBeats: number }>[] = [4, 2, 1].map((leadBeats) => ({
			params: { leadBeats },
			pass: { successes: 1 },
			drop: { failures: 1 }
		}));
		const at = (level: number): LevelState => ({
			exerciseId: 'x',
			scope: '',
			item: 'i',
			level,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		const up = nextLevelState(at(0), ladder, { success: true });
		expect(up.changed).toBe('up');
		expect(up.state.level).toBe(1);
		const down = nextLevelState(at(1), ladder, { success: false });
		expect(down.changed).toBe('down');
		expect(down.state.level).toBe(0);
	});
});
