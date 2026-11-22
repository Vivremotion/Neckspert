import type { StringNumber } from '$lib/domain/music/types';
import type { NeckMapCell } from '$lib/domain/types';

const ROW_ORDER: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** A row of the map: one string, a slot per fret of the map, empty where the string has no cell. */
export interface NeckRow {
	string: StringNumber;
	slots: { fret: number; cell: NeckMapCell | null }[];
}

/**
 * Six rows (string 6 → 1), each with a slot per fret any cell holds, low to high (the places the
 * neck's exercises list: frets 1..11 in the catalog). A place a string does not hold is an empty
 * slot, so an uneven or partial list keeps the grid's shape; an empty list gives empty rows.
 */
export function cellsByString(cells: readonly NeckMapCell[]): NeckRow[] {
	const byKey = new Map(cells.map((cell) => [`${cell.string}:${cell.fret}`, cell] as const));
	const frets = [...new Set(cells.map((cell) => cell.fret))].sort((a, b) => a - b);
	return ROW_ORDER.map((string) => ({
		string,
		slots: frets.map((fret) => ({ fret, cell: byKey.get(`${string}:${fret}`) ?? null }))
	}));
}
