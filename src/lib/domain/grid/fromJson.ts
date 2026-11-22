import { checkedId } from '$lib/domain/definitions/ids';
import { gridChanges, type ChordGrid, type GridChord } from './grid';
import { parseChordSymbol } from './symbols';

/**
 * The most chords a grid may write, counted before any is read or merged: a passage lists a
 * grid's changes, once per index.
 */
export const MAX_GRID_CHANGES = 256;

const GRID_KEYS = ['id', 'title', 'beatsPerBar', 'bars', 'chords'];
const CHORD_KEYS = ['bar', 'beat', 'symbol'];

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function chordFromJson(value: unknown, i: number): GridChord {
	const where = `chords[${i}]`;
	if (!isObject(value)) throw new Error(`${where} must be { bar, beat, symbol }`);
	const unknown = Object.keys(value).find((key) => !CHORD_KEYS.includes(key));
	if (unknown !== undefined) throw new Error(`${where}: unknown key "${unknown}"`);
	const { bar, beat, symbol } = value;
	if (typeof bar !== 'number') throw new Error(`${where}.bar must be a number`);
	if (typeof beat !== 'number') throw new Error(`${where}.beat must be a number`);
	if (typeof symbol !== 'string') throw new Error(`${where}.symbol must be a string`);
	try {
		parseChordSymbol(symbol);
	} catch (error) {
		throw new Error(`${where}.symbol: ${(error as Error).message}`, { cause: error });
	}
	return { bar, beat, symbol };
}

/**
 * A chord grid written in a JSON file. Throws an `Error` naming the field when it is no grid;
 * the rules of place (start on bar 1, beat 1, order, bounds) are those of `gridChanges`.
 */
export function gridFromJson(json: unknown): ChordGrid {
	if (!isObject(json)) throw new Error('a grid must be a JSON object');
	const unknown = Object.keys(json).find((key) => !GRID_KEYS.includes(key));
	if (unknown !== undefined) throw new Error(`unknown key "${unknown}"`);
	const { id, title, beatsPerBar, bars, chords } = json;
	const gridId = checkedId(id);
	if (typeof title !== 'string') throw new Error('title must be a string');
	if (beatsPerBar !== 4) throw new Error('beatsPerBar must be 4');
	if (typeof bars !== 'number' || !Number.isInteger(bars) || bars < 1) {
		throw new Error('bars must be a positive integer');
	}
	if (!Array.isArray(chords)) throw new Error('chords must be a list of { bar, beat, symbol }');
	if (chords.length > MAX_GRID_CHANGES) {
		throw new Error(`chords has ${chords.length} entries, more than ${MAX_GRID_CHANGES}`);
	}
	const grid: ChordGrid = {
		id: gridId,
		title,
		beatsPerBar,
		bars,
		chords: chords.map(chordFromJson)
	};
	gridChanges(grid);
	return grid;
}
