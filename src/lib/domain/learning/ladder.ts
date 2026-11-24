import type { LevelState } from '../time/levels';
import type { Ladder } from './subject';

/** A stored level brought into the ladder: above its top → the top; below 0 → 0. */
export function ladderLevel(state: LevelState, ladder: Ladder): LevelState {
	const highest = ladder.length - 1;
	const level = Math.min(Math.max(state.level, 0), highest);
	return level === state.level ? state : { ...state, level, successes: 0, failures: 0 };
}

/**
 * This success completes the top level's pass: the item is learned. The ladder is data: a top
 * that shows the answer learns its item with the answer shown.
 */
export function passesTop(state: LevelState, ladder: Ladder, success: boolean): boolean {
	const highest = ladder.length - 1;
	if (!success || state.level !== highest) return false;
	return state.successes + 1 >= (ladder[highest].pass?.successes ?? Infinity);
}

/**
 * Level `level` of the ladder asks a direct recall (`success: 'direct-recall'`): only an attempt
 * played there counts cold. Read from the level's mark, never from its rank.
 */
export function asksDirectRecall(ladder: Ladder, level: number): boolean {
	return ladder[level]?.success === 'direct-recall';
}
