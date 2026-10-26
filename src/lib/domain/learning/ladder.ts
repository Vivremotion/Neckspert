import { levelRange, type LevelState } from '../time/levels';
import type { Ladder } from './subject';

/** A stored level brought into the ladder: above its top → the top; below 0 → 0. */
export function ladderLevel(state: LevelState, ladder: Ladder): LevelState {
	const { highest } = levelRange(ladder);
	const level = Math.min(Math.max(state.level, 0), highest);
	return level === state.level ? state : { ...state, level, successes: 0, failures: 0 };
}

/**
 * This success completes the top level's pass: the item is learned. The ladder is data: a top
 * written aided learns its item with the answer shown.
 */
export function passesTop(state: LevelState, ladder: Ladder, success: boolean): boolean {
	const { highest } = levelRange(ladder);
	if (!success || state.level !== highest) return false;
	return state.successes + 1 >= (ladder[highest].pass?.successes ?? Infinity);
}
