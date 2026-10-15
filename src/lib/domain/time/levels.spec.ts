import { describe, expect, it } from 'vitest';
import { clickAccompaniment } from './accompaniment';
import { Fraction } from './fraction';
import {
	CYCLES_PER_BREATH,
	DROP_AFTER_FAILS,
	PASS_AFTER_CYCLES,
	levelRange,
	nextLevelState,
	resolveLevel,
	type Level,
	type LevelParams,
	type LevelState
} from './levels';
import { METER_4_4 } from './meter';

const accompaniment = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on']
});

const base: LevelParams = {
	accompaniment,
	cycleBars: 2,
	tempo: { at: Fraction.ZERO, bpm: 80, unit: Fraction.of(1, 4) },
	window: { ms: 120 },
	feedback: 'every-cycle',
	listen: 'free',
	cursor: true,
	cyclesPerBreath: CYCLES_PER_BREATH,
	thresholds: { precision: 40, regularity: 30 }
};

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

describe('resolveLevel', () => {
	it('lays the level params over the base', () => {
		const levels: Level[] = [{ params: { cycleBars: 4, cursor: false, window: { ms: 80 } } }];
		const resolved = resolveLevel(base, levels, 0);
		expect(resolved.cycleBars).toBe(4);
		expect(resolved.cursor).toBe(false);
		expect(resolved.window).toEqual({ ms: 80 });
		expect(resolved.feedback).toBe('every-cycle');
		expect(resolved.accompaniment).toBe(accompaniment);
	});

	it('merges thresholds field by field', () => {
		const levels: Level[] = [{ params: { thresholds: { precision: 25, holdDrift: 10 } } }];
		expect(resolveLevel(base, levels, 0).thresholds).toEqual({
			precision: 25,
			regularity: 30,
			holdDrift: 10
		});
	});

	it('does not change the base', () => {
		const levels: Level[] = [{ params: { thresholds: { precision: 25 }, cycleBars: 8 } }];
		resolveLevel(base, levels, 0);
		expect(base.thresholds).toEqual({ precision: 40, regularity: 30 });
		expect(base.cycleBars).toBe(2);
	});

	it('returns the base values for a level with no params', () => {
		expect(resolveLevel(base, plain, 1)).toEqual(base);
	});

	it('reads aid levels at negative indexes, -1 closest to level 1', () => {
		const levels: Level[] = [
			{ params: { cycleBars: 1 }, aid: true },
			{ params: { cycleBars: 2 }, aid: true },
			{ params: { cycleBars: 4 } },
			{ params: { cycleBars: 8 } }
		];
		expect(resolveLevel(base, levels, -2).cycleBars).toBe(1);
		expect(resolveLevel(base, levels, -1).cycleBars).toBe(2);
		expect(resolveLevel(base, levels, 0).cycleBars).toBe(4);
		expect(resolveLevel(base, levels, 1).cycleBars).toBe(8);
	});

	it('rejects an index outside the levels', () => {
		expect(() => resolveLevel(base, plain, 3)).toThrow(RangeError);
		expect(() => resolveLevel(base, plain, -1)).toThrow(RangeError);
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
