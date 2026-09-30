import { describe, expect, it } from 'vitest';
import type { NeckMapCell } from '$lib/domain/types';
import { STRING_NUMBERS } from '$lib/domain/music/types';
import { cellsByString } from './neckGrid';

function cell(string: 1 | 2 | 3 | 4 | 5 | 6, fret: number): NeckMapCell {
	return {
		string,
		fret,
		pitch: 'C',
		locate: 'unseen',
		identify: 'unseen',
		locateLeadBeats: null,
		identifyMedianReactionMs: null,
		coldAccuracy: null
	};
}

function fullBoard(): NeckMapCell[] {
	return STRING_NUMBERS.flatMap((string) =>
		Array.from({ length: 12 }, (_, fret) => cell(string, fret))
	);
}

describe('cellsByString', () => {
	it('orders string 6 at the top and frets 0..11 left to right', () => {
		// Plan snippet passed only 4 cells; cellsByString requires the full 72.
		const cells = fullBoard();
		const shuffled = [cells[71], cells[0], cells[1], cells[60], ...cells.slice(2, 60), ...cells.slice(61, 71)];
		const rows = cellsByString(shuffled);
		expect(rows).toHaveLength(6);
		expect(rows[0].map((c) => c.string)).toEqual(Array(12).fill(6));
		expect(rows[0].map((c) => c.fret)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(rows[5][0].string).toBe(1);
	});
});
