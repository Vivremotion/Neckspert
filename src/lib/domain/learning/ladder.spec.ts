import { describe, expect, it } from 'vitest';
import type { LevelState } from '../time/levels';
import { asksDirectRecall, ladderLevel, passesTop } from './ladder';
import type { Ladder } from './subject';

/** The name shown, then unaided: two levels, the top passed after 2 successes. */
const TWO: Ladder = [
	{ params: { leadBeats: null }, pass: { successes: 1 }, drop: { failures: 1 } },
	{ params: { leadBeats: null }, pass: { successes: 2 }, drop: { failures: 1 } }
];

const state = (over: Partial<LevelState>): LevelState => ({
	exerciseId: 'x',
	scope: '',
	item: 'i',
	level: 0,
	successes: 0,
	failures: 0,
	...over
});

describe('ladderLevel', () => {
	it('brings a stored level back into the ladder', () => {
		const ladder = TWO;
		const back = ladderLevel(state({ level: 2, successes: 1, failures: 1 }), ladder);
		expect(back).toMatchObject({ level: 1, successes: 0, failures: 0 });
		expect(ladderLevel(state({ level: -3, successes: 1 }), ladder).level).toBe(0);
	});
});

describe('passesTop', () => {
	it('marks the item learned when the top level’s pass completes', () => {
		const ladder = TWO;
		expect(passesTop(state({ level: 1, successes: 1 }), ladder, true)).toBe(true);
		expect(passesTop(state({ level: 1, successes: 1 }), ladder, false)).toBe(false);
		expect(passesTop(state({ level: 1, successes: 0 }), ladder, true)).toBe(false);
		expect(passesTop(state({ level: 0, successes: 5 }), ladder, true)).toBe(false);
	});
});

describe('asksDirectRecall', () => {
	it('reads the mark of the level, wherever it stands on the ladder', () => {
		const middle: Ladder = [
			{ params: { leadBeats: 8 } },
			{ params: { leadBeats: 4 }, success: 'direct-recall' },
			{ params: { leadBeats: 2 } }
		];
		expect([0, 1, 2].map((level) => asksDirectRecall(middle, level))).toEqual([false, true, false]);
		expect(asksDirectRecall(TWO, 1)).toBe(false);
		// A level the ladder does not hold asks nothing.
		expect(asksDirectRecall(middle, 3)).toBe(false);
	});
});
