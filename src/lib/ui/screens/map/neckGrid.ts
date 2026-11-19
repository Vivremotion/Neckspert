import type { StringNumber } from '$lib/domain/music/types';
import type { NeckMapCell } from '$lib/domain/types';

const ROW_ORDER: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/**
 * Six rows (string 6 → 1), each with the frets the cells hold, low to high (the places the
 * neck's exercises list: frets 1..11 in the catalog). Every string must hold every fret.
 */
export function cellsByString(cells: readonly NeckMapCell[]): NeckMapCell[][] {
	const byKey = new Map(cells.map((cell) => [`${cell.string}:${cell.fret}`, cell] as const));
	const frets = [...new Set(cells.map((cell) => cell.fret))].sort((a, b) => a - b);
	return ROW_ORDER.map((string) =>
		frets.map((fret) => {
			const found = byKey.get(`${string}:${fret}`);
			if (!found) {
				throw new Error(`Missing neck map cell string ${string} fret ${fret}`);
			}
			return found;
		})
	);
}
