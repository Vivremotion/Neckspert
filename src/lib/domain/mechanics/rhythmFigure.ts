import type { MechanicIdentity } from './types';

/** What a rhythm attempt is about: a figure of the exercise, played at a level. */
export interface RhythmItem {
	figureId: string;
	/** Level index; the aid levels, below the first, are negative. */
	level: number;
}

const SEPARATOR = '@';
const LEVEL = /^-?\d+$/;

/**
 * Pure rhythm: a figure played cycle after cycle. A skill (its attempts are kept with their
 * observations, no card) with no time relation of its own: a cycle is judged by the plan of
 * expectations the session compiles from the figure (`time/plan`), not by a one-answer relation.
 */
export const rhythmFigureRules: MechanicIdentity<RhythmItem> = {
	id: 'rhythm-figure',
	learner: 'skill',
	itemKey: ({ figureId, level }) => `${figureId}${SEPARATOR}${level}`,
	parseItem: (itemKey) => {
		const at = itemKey.lastIndexOf(SEPARATOR);
		const figureId = itemKey.slice(0, at);
		const level = itemKey.slice(at + 1);
		if (at < 1 || !LEVEL.test(level)) throw new Error(`Invalid rhythm item key: "${itemKey}"`);
		return { figureId, level: Number(level) };
	}
};
