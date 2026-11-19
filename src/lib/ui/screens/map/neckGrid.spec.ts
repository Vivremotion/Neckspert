import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
import { findExercise } from '$lib/domain/exercise';
import { pitchOnString } from '$lib/domain/music';
import { buildNeckMap } from '$lib/domain/progress';
import { skillById } from '$lib/domain/skill/registry';
import { IDENTIFY_NECK } from '$lib/testing/catalog';
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
		locateRecallMs: null,
		identifyMedianReactionMs: null,
		coldAccuracy: null
	};
}

function fullBoard(): NeckMapCell[] {
	return STRING_NUMBERS.flatMap((string) =>
		Array.from({ length: 11 }, (_, index) => cell(string, index + 1))
	);
}

describe('cellsByString', () => {
	it('orders string 6 at the top and frets 1..11 left to right', () => {
		const cells = fullBoard();
		const shuffled = [
			cells[65],
			cells[0],
			cells[1],
			cells[60],
			...cells.slice(2, 60),
			...cells.slice(61, 65)
		];
		const rows = cellsByString(shuffled);
		expect(rows).toHaveLength(6);
		expect(rows[0].slots.map((slot) => slot.cell?.string)).toEqual(Array(11).fill(6));
		expect(rows[0].slots.map((slot) => slot.cell?.fret)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
		]);
		expect(rows[5].slots[0].cell?.string).toBe(1);
	});

	it('leaves an empty slot where a string lacks a fret another holds, and throws nothing', () => {
		// An imported list names the open first string: fret 0 on string 1 only.
		const rows = cellsByString([...fullBoard(), cell(1, 0)]);
		expect(rows.map((row) => row.string)).toEqual([6, 5, 4, 3, 2, 1]);
		expect(rows.every((row) => row.slots.length === 12)).toBe(true);
		expect(rows[0].slots[0]).toEqual({ fret: 0, cell: null });
		expect(rows[5].slots[0].cell).toEqual(cell(1, 0));
	});

	it('keeps the grid’s shape for a partial list alone', () => {
		const rows = cellsByString([cell(2, 1), cell(3, 4)]);
		expect(rows.map((row) => row.slots.map((slot) => slot.fret))).toEqual(Array(6).fill([1, 4]));
		expect(rows[4].slots.map((slot) => slot.cell?.fret ?? null)).toEqual([1, null]);
		expect(rows[3].slots.map((slot) => slot.cell?.fret ?? null)).toEqual([null, 4]);
		expect(rows[0].slots.every((slot) => slot.cell === null)).toBe(true);
	});

	it('gives six empty rows for an empty list', () => {
		const rows = cellsByString([]);
		expect(rows).toHaveLength(6);
		expect(rows.every((row) => row.slots.length === 0)).toBe(true);
	});

	describe('with an imported file', () => {
		afterEach(() => {
			loadDefinitions({ catalog: CATALOG_FILES });
		});

		it('maps an exercise naming the open first string beside the catalog’s, without throwing', () => {
			const imported = {
				format: 0,
				skills: [{ ...skillById(IDENTIFY_NECK.practices), id: 'open-names' }],
				grids: [],
				exercises: [
					{ ...IDENTIFY_NECK, id: 'open-names-ex', practices: 'open-names', items: ['1:0'] }
				]
			};
			loadDefinitions({
				catalog: CATALOG_FILES,
				imported: { 'mine.json': JSON.stringify(imported) }
			});
			expect(findExercise('open-names-ex')).toBeDefined();
			const cells = buildNeckMap({ cards: [], attempts: [], pitchAt: pitchOnString });
			const rows = cellsByString(cells);
			expect(rows[5].slots[0].cell).toMatchObject({ string: 1, fret: 0 });
			expect(rows[0].slots[0]).toEqual({ fret: 0, cell: null });
		});
	});
});
