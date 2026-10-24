import { describe, expect, it } from 'vitest';
import type { LevelState } from '../time/levels';
import { aidLadder, ladderLevel, leadLadder, passesTop } from './ladder';

const state = (over: Partial<LevelState>): LevelState => ({
	exerciseId: 'x',
	scope: '',
	item: 'i',
	level: 0,
	successes: 0,
	failures: 0,
	resumeAfter: null,
	...over
});

describe('leadLadder', () => {
	it('climbs from 8 to the longest lead that fits the recall threshold', () => {
		const slow = leadLadder({
			steps: [8, 4, 2],
			tempoBpm: 80,
			recallThresholdMs: 1500,
			learnedAfter: 2
		});
		expect(slow.map((l) => l.params.leadBeats)).toEqual([8, 4, 2]);
		expect(slow.map((l) => l.params.aided)).toEqual([true, false, false]);
		expect(slow.map((l) => l.pass?.successes)).toEqual([1, 1, 2]);
		expect(slow.map((l) => l.drop?.failures)).toEqual([1, 1, 1]);
		const fast = leadLadder({
			steps: [8, 4, 2],
			tempoBpm: 160,
			recallThresholdMs: 1500,
			learnedAfter: 2
		});
		expect(fast.map((l) => l.params.leadBeats)).toEqual([8, 4]);
	});

	it('keeps its top unaided when a single step is kept', () => {
		const single = (steps: readonly (2 | 4 | 8)[], recallThresholdMs: number) =>
			leadLadder({ steps, tempoBpm: 80, recallThresholdMs, learnedAfter: 2 });
		// Steps [8] alone, and the longest step already fitting the threshold (8 beats = 6 000 ms).
		for (const ladder of [single([8], 1500), single([8, 4, 2], 6000)]) {
			expect(ladder.map((l) => l.params)).toEqual([
				{ leadBeats: 8, aided: true },
				{ leadBeats: 8, aided: false }
			]);
			expect(ladder.map((l) => l.pass?.successes)).toEqual([1, 2]);
		}
	});
});

describe('aidLadder', () => {
	it('gives identify the name shown, then unaided', () => {
		const ladder = aidLadder(2);
		expect(ladder.map((l) => l.params)).toEqual([
			{ leadBeats: null, aided: true },
			{ leadBeats: null, aided: false }
		]);
		expect(ladder[1].pass).toEqual({ successes: 2 });
	});
});

describe('ladderLevel', () => {
	it('brings a stored level back into the ladder', () => {
		const ladder = aidLadder(2);
		const back = ladderLevel(state({ level: 2, successes: 1, failures: 1 }), ladder);
		expect(back).toMatchObject({ level: 1, successes: 0, failures: 0 });
		expect(ladderLevel(state({ level: -3, successes: 1 }), ladder).level).toBe(0);
	});
});

describe('passesTop', () => {
	it('marks the item learned when the top level’s pass completes', () => {
		const ladder = aidLadder(2);
		expect(passesTop(state({ level: 1, successes: 1 }), ladder, true)).toBe(true);
		expect(passesTop(state({ level: 1, successes: 1 }), ladder, false)).toBe(false);
		expect(passesTop(state({ level: 1, successes: 0 }), ladder, true)).toBe(false);
		expect(passesTop(state({ level: 0, successes: 5 }), ladder, true)).toBe(false);
	});
});
