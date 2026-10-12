import { parseChordSymbol } from './symbols';

/** Where a chord starts: bar (1…) and beat (1…), fractional (4.5: the eighth after beat 4). */
export interface GridChord {
	bar: number;
	beat: number;
	symbol: string;
}

/** A chord chart as data, written with its real symbols. */
export interface ChordGrid {
	id: string;
	title: string;
	beatsPerBar: 4;
	bars: number;
	chords: readonly GridChord[];
}

/** A change: its start and length in beats from the start of the grid, and its symbol. */
export interface GridChange {
	at: number;
	length: number;
	symbol: string;
}

function beatsFromStart(grid: ChordGrid, chord: GridChord): number {
	return (chord.bar - 1) * grid.beatsPerBar + (chord.beat - 1);
}

function validate(grid: ChordGrid): void {
	const [first] = grid.chords;
	if (!first || first.bar !== 1 || first.beat !== 1) {
		throw new RangeError(`Grid ${grid.id} must start on bar 1, beat 1`);
	}
	grid.chords.forEach((chord, i) => {
		if (!Number.isInteger(chord.bar) || chord.bar < 1 || chord.bar > grid.bars) {
			throw new RangeError(`Grid ${grid.id}: bar ${chord.bar} is outside the grid`);
		}
		if (!(chord.beat >= 1 && chord.beat < grid.beatsPerBar + 1)) {
			throw new RangeError(`Grid ${grid.id}: beat ${chord.beat} is outside its bar`);
		}
		if (i > 0 && beatsFromStart(grid, chord) <= beatsFromStart(grid, grid.chords[i - 1])) {
			throw new RangeError(`Grid ${grid.id}: chord ${i + 1} does not come after the one before`);
		}
		parseChordSymbol(chord.symbol);
	});
}

/**
 * The changes of a grid, in order. Two equal symbols in a row are one change (Cmaj7 written in
 * two bars lasts both). Throws a RangeError on an invalid grid.
 */
export function gridChanges(grid: ChordGrid): GridChange[] {
	validate(grid);
	const end = grid.bars * grid.beatsPerBar;
	const changes: GridChange[] = [];
	for (const chord of grid.chords) {
		if (changes.at(-1)?.symbol === chord.symbol) continue;
		changes.push({ at: beatsFromStart(grid, chord), length: 0, symbol: chord.symbol });
	}
	changes.forEach((change, i) => {
		change.length = (changes[i + 1]?.at ?? end) - change.at;
	});
	return changes;
}
