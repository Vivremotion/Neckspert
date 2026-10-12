import { describe, expect, it } from 'vitest';
import { gridById, GRIDS } from './catalog';
import { gridChanges, type ChordGrid } from './grid';

function grid(chords: ChordGrid['chords'], bars = 2): ChordGrid {
	return { id: 'test', title: 'Test', beatsPerBar: 4, bars, chords };
}

describe('gridChanges', () => {
	it('reads iohefy-a: Cmaj7 held over two bars is one change', () => {
		const changes = gridChanges(gridById('iohefy-a'));
		expect(changes.map((c) => c.symbol)).toEqual([
			'Dm7',
			'G7',
			'Dm7',
			'G7',
			'Cmaj7',
			'F7',
			'Em7',
			'Ebm7',
			'Ab7'
		]);
		expect(changes[4]).toEqual({ at: 16, length: 6, symbol: 'Cmaj7' });
		expect(changes[5]).toEqual({ at: 22, length: 2, symbol: 'F7' });
		expect(changes[8]).toEqual({ at: 30, length: 2, symbol: 'Ab7' });
		expect(changes.reduce((sum, c) => sum + c.length, 0)).toBe(32);
	});

	it('reads blues-f, the bars held twice merged', () => {
		const changes = gridChanges(gridById('blues-f'));
		expect(changes.map((c) => `${c.symbol}@${c.at}+${c.length}`)).toEqual([
			'F7@0+4',
			'Bb7@4+4',
			'F7@8+8',
			'Bb7@16+8',
			'F7@24+8',
			'C7@32+4',
			'Bb7@36+4',
			'F7@40+4',
			'C7@44+4'
		]);
	});

	it('places a change between two beats', () => {
		const changes = gridChanges(
			grid([
				{ bar: 1, beat: 1, symbol: 'C' },
				{ bar: 1, beat: 2.5, symbol: 'F' },
				{ bar: 2, beat: 1 + 2 / 3, symbol: 'G' }
			])
		);
		expect(changes[1]).toMatchObject({ at: 1.5, symbol: 'F' });
		expect(changes[1].length).toBeCloseTo(3.1667);
		expect(changes[2].at).toBeCloseTo(4.6667);
		expect(changes[2].length).toBeCloseTo(3.3333);
	});

	it('refuses a grid that does not start on bar 1, beat 1', () => {
		expect(() => gridChanges(grid([{ bar: 1, beat: 2, symbol: 'C' }]))).toThrow(RangeError);
		expect(() => gridChanges(grid([]))).toThrow(RangeError);
	});

	it('refuses positions that do not grow', () => {
		const chords = [
			{ bar: 1, beat: 1, symbol: 'C' },
			{ bar: 1, beat: 3, symbol: 'F' },
			{ bar: 1, beat: 3, symbol: 'G' }
		];
		expect(() => gridChanges(grid(chords))).toThrow(RangeError);
	});

	it('refuses a beat outside its bar and a bar outside the grid', () => {
		const start = { bar: 1, beat: 1, symbol: 'C' };
		expect(() => gridChanges(grid([start, { bar: 1, beat: 5, symbol: 'F' }]))).toThrow(RangeError);
		expect(() => gridChanges(grid([start, { bar: 1, beat: 0.5, symbol: 'F' }]))).toThrow(
			RangeError
		);
		expect(() => gridChanges(grid([start, { bar: 3, beat: 1, symbol: 'F' }]))).toThrow(RangeError);
	});

	it('refuses an unknown symbol', () => {
		expect(() => gridChanges(grid([{ bar: 1, beat: 1, symbol: 'Gsus' }]))).toThrow(/Gsus/);
	});
});

describe('the grid catalog', () => {
	it('holds the two starting grids, valid, as data', () => {
		expect(GRIDS.map((g) => g.id)).toEqual(['iohefy-a', 'blues-f']);
		for (const g of GRIDS) expect(() => gridChanges(g)).not.toThrow();
		expect(JSON.parse(JSON.stringify(GRIDS))).toEqual(GRIDS);
	});

	it('throws on an unknown grid', () => {
		expect(() => gridById('nope')).toThrow(/nope/);
	});
});
