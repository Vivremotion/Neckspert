import { STRING_NUMBERS, type PitchName, type StringNumber } from '$lib/domain/music/types';
import { pitchOnString } from './fretboard';
import type { LocateItem, NeckCard } from './items';

/** The note a string is named after in a prompt ("corde de A"). */
export function openPitch(string: StringNumber): PitchName {
	return pitchOnString(string, 0);
}

/**
 * Mirror pair (locate): "X on string S" and "Y on string T", where X names T and Y names S.
 * Reading one prompt as the other plays the string's own name: A on the low E string and E
 * on the A string. E names strings 1 and 6.
 */
export function isMirrorPair(a: NeckCard, b: NeckCard): boolean {
	if (a.mechanic !== 'locate' || b.mechanic !== 'locate') return false;
	if (a.item.string === b.item.string) return false;
	return a.item.pitch === openPitch(b.item.string) && b.item.pitch === openPitch(a.item.string);
}

/** Every locate item that forms a mirror pair with `item`, strings 1 to 6. */
export function mirrorItems(item: LocateItem): LocateItem[] {
	return STRING_NUMBERS.filter(
		(string) => string !== item.string && openPitch(string) === item.pitch
	).map((string) => ({ string, pitch: openPitch(item.string) }));
}
