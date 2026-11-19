import { gridById, gridChanges } from '$lib/domain/grid';
import type { Family, Member } from '../core/types';
import type { PassageDerivation } from '../index';

/** A chord grid of the registry, by its id. */
export interface GridChangesIndex {
	grid: string;
}

/** A change of a grid: its rank in the grid, its start and length in beats, its symbol. */
export interface GridChangeMember extends Member {
	rank: number;
	at: number;
	length: number;
	symbol: string;
}

/** Joins a grid and the rank of a change in it: `iohefy-a#2`. */
const SEPARATOR = '#';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The changes of a grid, or why the family cannot read the index. */
function changesOf(index: unknown): GridChangeMember[] | { problem: string } {
	if (!isObject(index) || typeof index.grid !== 'string') {
		return { problem: 'grid-changes reads a grid { grid }' };
	}
	const grid = index.grid;
	let changes;
	try {
		changes = gridChanges(gridById(grid));
	} catch {
		return { problem: `grid-changes: unknown grid "${grid}"` };
	}
	return changes.map(({ at, length, symbol }, rank) => ({
		id: `${grid}${SEPARATOR}${rank}`,
		rank,
		at,
		length,
		symbol
	}));
}

/**
 * The changes of a chord grid, in order (`gridChanges`: equal symbols in a row are one change).
 * It lists a passage's rounds and is never judged: it recognises nothing and tells no confusion.
 */
export const gridChangesFamily: Family<GridChangesIndex, GridChangeMember> = {
	id: 'grid-changes',
	indexProblem(index) {
		const read = changesOf(index);
		return 'problem' in read ? read.problem : null;
	},
	members(index) {
		const read = changesOf(index);
		return 'problem' in read ? [] : read;
	},
	member(id) {
		const at = id.lastIndexOf(SEPARATOR);
		const rank = id.slice(at + 1);
		if (at < 1 || !/^\d+$/.test(rank)) return null;
		const read = changesOf({ grid: id.slice(0, at) });
		return 'problem' in read ? null : (read[Number(rank)] ?? null);
	},
	attributes: {
		rank: (member: GridChangeMember) => member.rank,
		at: (member: GridChangeMember) => member.at,
		length: (member: GridChangeMember) => member.length
	},
	recognise: () => null,
	heard: () => null,
	named: () => null,
	confusion: () => null,
	answer: () => null
};

/** A passage of a grid's changes: the grid its index names, each change the item of its rank. */
export const MUSIC_PASSAGE_DERIVATIONS: Readonly<Record<string, PassageDerivation>> = {
	[gridChangesFamily.id]: {
		set: 'change',
		passageIndex(of): GridChangesIndex {
			if (typeof of.grid !== 'string') {
				throw new Error('"grid" must be the id of a grid');
			}
			return { grid: of.grid };
		},
		itemOf(member) {
			const { id, rank } = member as GridChangeMember;
			return { grid: id.slice(0, id.lastIndexOf(SEPARATOR)), index: rank };
		}
	}
};
