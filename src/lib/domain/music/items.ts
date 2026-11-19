import { CHROMATIC_NOTES, MAX_PROMPT_FRET, type PitchName, type StringNumber } from './types';

/** Locate: play `pitch` on `string`, any octave playable on that string. */
export interface LocateItem {
	string: StringNumber;
	pitch: PitchName;
}

/** Identify: name the note at `string`, `fret` (0 to MAX_PROMPT_FRET). */
export interface IdentifyItem {
	string: StringNumber;
	fret: number;
}

/** Splits `string:value`, checking the string; throws on any other shape. */
function splitItemKey(key: string): { string: StringNumber; value: string } {
	const parts = key.split(':');
	if (parts.length !== 2 || parts[1] === '') {
		throw new Error(`Invalid item key: ${key}`);
	}
	const string = Number(parts[0]);
	if (!Number.isInteger(string) || string < 1 || string > 6) {
		throw new Error(`Invalid string in item key: ${key}`);
	}
	return { string: string as StringNumber, value: parts[1] };
}

export function locateItemKey(item: LocateItem): string {
	return `${item.string}:${item.pitch}`;
}

export function parseLocateItem(key: string): LocateItem {
	const { string, value } = splitItemKey(key);
	if (!(CHROMATIC_NOTES as readonly string[]).includes(value)) {
		throw new Error(`Invalid pitch in item key: ${key}`);
	}
	return { string, pitch: value as PitchName };
}

export function identifyItemKey(item: IdentifyItem): string {
	return `${item.string}:${item.fret}`;
}

export function parseIdentifyItem(key: string): IdentifyItem {
	const { string, value } = splitItemKey(key);
	const fret = Number(value);
	if (!Number.isInteger(fret) || fret < 0 || fret > MAX_PROMPT_FRET) {
		throw new Error(`Invalid fret in item key: ${key}`);
	}
	return { string, fret };
}
