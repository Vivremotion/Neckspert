import { describe, expect, it } from 'vitest';
import {
	CYCLES_PER_BREATH,
	DROP_AFTER_FAILS,
	PASS_AFTER_CYCLES,
	levelRange,
	nextLevelState,
	checkStart,
	type Level,
	type LevelParams,
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

const ok = { success: true, aided: false };
const ko = { success: false, aided: false };

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
		expect([PASS_AFTER_CYCLES, DROP_AFTER_FAILS, CYCLES_PER_BREATH]).toEqual([3, 2, 4]);
	});
});

describe('checkStart', () => {
	it('refuses a start with no listen-in and no counted bar, or a listen-in that is not whole', () => {
		const at = (params: Pick<LevelParams, 'listenInBars' | 'countIn'>) => () => checkStart(params);
		expect(at({ listenInBars: 0, countIn: false })).toThrow(RangeError);
		expect(at({ listenInBars: -1 })).toThrow(RangeError);
		expect(at({ listenInBars: 1.5 })).toThrow(RangeError);
		expect(at({ listenInBars: 0 })).not.toThrow();
		expect(at({ countIn: false })).not.toThrow();
		expect(at({})).not.toThrow();
	});
});

describe('levelRange', () => {
	it('counts the aid levels below the first level', () => {
		const levels: Level[] = [
			{ params: {}, aid: true },
			{ params: {}, aid: true },
			{ params: {} },
			{ params: {} },
			{ params: {} }
		];
		expect(levelRange(levels)).toEqual({ lowest: -2, first: 0, highest: 2 });
	});

	it('has no aid levels in a plain ladder', () => {
		expect(levelRange(plain)).toEqual({ lowest: 0, first: 0, highest: 2 });
	});

	it('rejects a ladder with no regular level or an aid level above one', () => {
		expect(() => levelRange([])).toThrow(RangeError);
		expect(() => levelRange([{ params: {}, aid: true }])).toThrow(RangeError);
		expect(() => levelRange([{ params: {} }, { params: {}, aid: true }])).toThrow(RangeError);
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

	it('does not descend into the aid levels', () => {
		const levels: Level[] = [{ params: {}, aid: true }, { params: {} }, { params: {} }];
		const { state, changes } = play(stateAt(0), levels, [ko, ko, ko, ko]);
		expect(changes).toEqual([]);
		expect(state.level).toBe(0);
	});

	it('stays at the highest level after three successes', () => {
		const { state, changes } = play(stateAt(2), plain, [ok, ok, ok, ok]);
		expect(changes).toEqual([]);
		expect(state.level).toBe(2);
	});

	it('an aided success neither counts nor goes up, and resets the successes', () => {
		const aided = { success: true, aided: true };
		const { state, changes } = play(stateAt(0), plain, [ok, ok, aided]);
		expect(changes).toEqual([]);
		expect(state).toMatchObject({ level: 0, successes: 0 });
		// Three more unaided successes are needed.
		expect(play(state, plain, [ok, ok]).changes).toEqual([]);
		expect(play(state, plain, [ok, ok, ok]).changes).toEqual([{ at: 2, changed: 'up' }]);
	});

	it('an aided failure neither counts nor goes down', () => {
		const aided = { success: false, aided: true };
		const { state, changes } = play(stateAt(1, { failures: 1 }), plain, [aided, aided, aided]);
		expect(changes).toEqual([]);
		expect(state).toMatchObject({ level: 1, failures: 1, successes: 0 });
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

	it('climbs from an aid level toward level 1 by its pass condition', () => {
		const levels: Level[] = [{ params: {}, aid: true }, { params: {} }];
		const { state, changes } = play(stateAt(-1), levels, [ok, ok, ok]);
		expect(changes).toEqual([{ at: 2, changed: 'up' }]);
		expect(state.level).toBe(0);
	});

	it('keeps counting failures at the floor, for the anti-blocking to read', () => {
		const { state, changes } = play(stateAt(0), plain, [ko, ko, ko, ko]);
		expect(changes).toEqual([]);
		expect(state).toMatchObject({ level: 0, failures: 4, successes: 0 });
	});

	it('never descends further from an aid level, and keeps counting failures there', () => {
		const levels: Level[] = [{ params: {}, aid: true }, { params: {}, aid: true }, { params: {} }];
		const { state, changes } = play(stateAt(-1), levels, [ko, ko, ko]);
		expect(changes).toEqual([]);
		expect(state).toMatchObject({ level: -1, failures: 3 });
	});

	it('an aided cycle between two failures does not break their run', () => {
		const aided = { success: false, aided: true };
		const { state, changes } = play(stateAt(1), plain, [ko, aided, ko]);
		expect(changes).toEqual([{ at: 2, changed: 'down' }]);
		expect(state.level).toBe(0);
	});

	it("an aid level's own aid is not an aid: unaided successes climb out of it", () => {
		const levels: Level[] = [{ params: {}, aid: true }, { params: {} }];
		// `aided` means an aid other than the level's own (listen, play-along, cursor...).
		const aided = { success: true, aided: true };
		const held = play(stateAt(-1), levels, [ok, ok, aided, ok]);
		expect(held.changes).toEqual([]);
		expect(held.state).toMatchObject({ level: -1, successes: 1 });
		const climbed = play(stateAt(-1), levels, [ok, ok, ok]);
		expect(climbed.changes).toEqual([{ at: 2, changed: 'up' }]);
		expect(climbed.state.level).toBe(0);
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

	it('rejects a state whose level is outside the ladder', () => {
		expect(() => nextLevelState(stateAt(5), plain, ok)).toThrow(RangeError);
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
		const up = nextLevelState(at(0), ladder, { success: true, aided: false });
		expect(up.changed).toBe('up');
		expect(up.state.level).toBe(1);
		const down = nextLevelState(at(1), ladder, { success: false, aided: false });
		expect(down.changed).toBe('down');
		expect(down.state.level).toBe(0);
	});
});
