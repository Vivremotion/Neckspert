import type { LeadBeats } from '../types';
import { levelRange, type LevelState } from '../time/levels';
import type { Ladder } from './subject';

/**
 * Lead steps (longest first) down to the longest one whose duration at `tempoBpm` fits
 * `recallThresholdMs`, at least the shortest; the longest step is aided; `pass = 1`,
 * `drop = 1`, the top's `pass = learnedAfter`. The top is never aided: when a single step is
 * kept, it gives two levels at that lead, aided then unaided.
 */
export function leadLadder(input: {
	steps: readonly LeadBeats[];
	tempoBpm: number;
	recallThresholdMs: number;
	learnedAfter: number;
}): Ladder {
	const { steps, tempoBpm, recallThresholdMs, learnedAfter } = input;
	if (steps.length === 0) throw new RangeError('a lead ladder needs at least one step');
	const beatMs = 60_000 / tempoBpm;
	const fits = steps.findIndex((lead) => lead * beatMs <= recallThresholdMs);
	const fitting = steps.slice(0, (fits < 0 ? steps.length - 1 : fits) + 1);
	const kept = fitting.length === 1 ? [fitting[0], fitting[0]] : fitting;
	return kept.map((leadBeats, index) => ({
		params: { leadBeats, aided: index === 0 },
		pass: { successes: index === kept.length - 1 ? learnedAfter : 1 },
		drop: { failures: 1 }
	}));
}

/** Two levels: the answer shown, then unaided; the top's `pass = learnedAfter`. */
export function aidLadder(learnedAfter: number): Ladder {
	return [
		{ params: { leadBeats: null, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
		{
			params: { leadBeats: null, aided: false },
			pass: { successes: learnedAfter },
			drop: { failures: 1 }
		}
	];
}

/** A stored level brought into the ladder: above its top → the top; below 0 → 0. */
export function ladderLevel(state: LevelState, ladder: Ladder): LevelState {
	const { highest } = levelRange(ladder);
	const level = Math.min(Math.max(state.level, 0), highest);
	return level === state.level ? state : { ...state, level, successes: 0, failures: 0 };
}

/**
 * This success completes the top level's pass: the item is learned. The top is never aided
 * (`leadLadder`, `aidLadder`), so an attempt played with the answer shown never learns its item.
 */
export function passesTop(state: LevelState, ladder: Ladder, success: boolean): boolean {
	const { highest } = levelRange(ladder);
	if (!success || state.level !== highest) return false;
	return state.successes + 1 >= (ladder[highest].pass?.successes ?? Infinity);
}
