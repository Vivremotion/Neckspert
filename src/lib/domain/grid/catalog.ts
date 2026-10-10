import type { ChordGrid } from './grid';

/**
 * « I Only Have Eyes for You », lines 1 and 2 with the first ending, as the course's iReal Pro
 * chart writes them (spec 2026-10-10, section 1).
 */
export const IOHEFY_A: ChordGrid = {
	id: 'iohefy-a',
	title: 'I Only Have Eyes for You',
	beatsPerBar: 4,
	bars: 8,
	chords: [
		{ bar: 1, beat: 1, symbol: 'Dm7' },
		{ bar: 2, beat: 1, symbol: 'G7' },
		{ bar: 3, beat: 1, symbol: 'Dm7' },
		{ bar: 4, beat: 1, symbol: 'G7' },
		{ bar: 5, beat: 1, symbol: 'Cmaj7' },
		{ bar: 6, beat: 1, symbol: 'Cmaj7' },
		{ bar: 6, beat: 3, symbol: 'F7' },
		{ bar: 7, beat: 1, symbol: 'Em7' },
		{ bar: 8, beat: 1, symbol: 'Ebm7' },
		{ bar: 8, beat: 3, symbol: 'Ab7' }
	]
};

/** A twelve-bar blues in F, the simple form; which form the course meant is to confirm. */
export const BLUES_F: ChordGrid = {
	id: 'blues-f',
	title: 'Blues F',
	beatsPerBar: 4,
	bars: 12,
	chords: ['F7', 'Bb7', 'F7', 'F7', 'Bb7', 'Bb7', 'F7', 'F7', 'C7', 'Bb7', 'F7', 'C7'].map(
		(symbol, i) => ({ bar: i + 1, beat: 1, symbol })
	)
};

export const GRIDS: readonly ChordGrid[] = [IOHEFY_A, BLUES_F];

export function gridById(id: string): ChordGrid {
	const found = GRIDS.find((grid) => grid.id === id);
	if (!found) throw new Error(`Unknown grid: ${id}`);
	return found;
}
