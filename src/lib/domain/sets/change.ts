import { allGrids } from '$lib/domain/grid/registry';
import type { ChordGridConfusion, ChordReading } from '$lib/domain/families/guitar/chordShapes';
import type { AttemptPassage } from '$lib/domain/types';
import type { VoicingFigureItem } from './placedVoicing';
import type { ItemSet } from './types';

/** A change of a chord grid: the grid and the rank of the change in it. */
export interface ChangeItem {
	grid: string;
	index: number;
}

/** Joins a grid and the rank of a change in it: `iohefy-a#2`. */
const SEPARATOR = '#';

/** The changes of the chord grids, each keyed `<grid>#<rank>`. */
export const changeSet: ItemSet<ChangeItem> = {
	id: 'change',
	itemKey: ({ grid, index }) => `${grid}${SEPARATOR}${index}`,
	parseItem: (itemKey) => {
		const at = itemKey.lastIndexOf(SEPARATOR);
		const grid = at < 0 ? '' : itemKey.slice(0, at);
		const rank = at < 0 ? '' : itemKey.slice(at + 1);
		// A grid's id holds no `:`: a key written before version 13 began with its element (`jam:…`).
		if (
			grid === '' ||
			grid.includes(':') ||
			!/^\d+$/.test(rank) ||
			!Number.isSafeInteger(Number(rank))
		) {
			throw new RangeError(`Not a change key: "${itemKey}"`);
		}
		return { grid, index: Number(rank) };
	},
	// The grids of every file are registered before any exercise is checked.
	itemProblem: ({ grid }) =>
		allGrids().some((known) => known.id === grid)
			? null
			: `names grid "${grid}", which no file defines`
};

/**
 * `Attempt.data` of a change of a passage: its item (a change of a grid, or the placed shape a
 * link asks), its passage (null for a round served outside one), the shape heard and what went wrong.
 */
export interface ChangeData {
	item: ChangeItem | VoicingFigureItem;
	passage: AttemptPassage | null;
	answer: ChordReading | null;
	confusion: ChordGridConfusion | null;
}
