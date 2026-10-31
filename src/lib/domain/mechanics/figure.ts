import type { MechanicIdentity } from './types';

/** What a figure attempt is about: a figure of the exercise, played at a level. */
export interface FigureItem {
	figureId: string;
	/** Level index; the aid levels, below the first, are negative. */
	level: number;
}

const SEPARATOR = '@';
const LEVEL = /^-?\d+$/;

/**
 * A figure played round after round (the rhythm's cycles). A skill (its attempts are kept with
 * their observations, no card) with no time relation of its own: a round is judged by the plan of
 * expectations its exercise's round template compiles from the figure, not by a one-answer
 * relation.
 */
export const figureRules: MechanicIdentity<FigureItem> = {
	id: 'figure',
	learner: 'skill',
	itemKey: ({ figureId, level }) => `${figureId}${SEPARATOR}${level}`,
	parseItem: (itemKey) => {
		const at = itemKey.lastIndexOf(SEPARATOR);
		const figureId = itemKey.slice(0, at);
		const level = itemKey.slice(at + 1);
		if (at < 1 || !LEVEL.test(level)) throw new Error(`Invalid figure item key: "${itemKey}"`);
		return { figureId, level: Number(level) };
	}
};
