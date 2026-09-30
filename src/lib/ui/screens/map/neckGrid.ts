import type { StringNumber } from '$lib/domain/music/types';
import type { NeckMapCell } from '$lib/domain/types';

const ROW_ORDER: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Six rows (string 6 → 1), each with frets 0..11. Missing cells are omitted from that slot's source list — callers pass the full 72. */
export function cellsByString(cells: readonly NeckMapCell[]): NeckMapCell[][] {
	const byKey = new Map(cells.map((cell) => [`${cell.string}:${cell.fret}`, cell] as const));
	return ROW_ORDER.map((string) =>
		Array.from({ length: 12 }, (_, fret) => {
			const found = byKey.get(`${string}:${fret}`);
			if (!found) {
				throw new Error(`Missing neck map cell string ${string} fret ${fret}`);
			}
			return found;
		})
	);
}
