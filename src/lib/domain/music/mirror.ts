import { STRING_NUMBERS, type PitchName, type StringNumber } from '$lib/domain/music/types';
import type { LocateTarget, Target } from '$lib/domain/types';
import { pitchOnString } from './fretboard';

/** The note a string is named after in a prompt ("corde de A"). */
export function openPitch(string: StringNumber): PitchName {
	return pitchOnString(string, 0);
}

/**
 * Mirror pair (mode 1): "X on string S" and "Y on string T", where X names T and Y names S.
 * Reading one prompt as the other plays the string's own name: A on the low E string and E
 * on the A string. E names strings 1 and 6.
 */
export function isMirrorPair(a: Target, b: Target): boolean {
	if (a.direction !== 'locate' || b.direction !== 'locate') return false;
	if (a.string === b.string) return false;
	return a.pitch === openPitch(b.string) && b.pitch === openPitch(a.string);
}

/** Every mode 1 target that forms a mirror pair with `target`, strings 1 to 6. */
export function mirrorTargets(target: LocateTarget): LocateTarget[] {
	return STRING_NUMBERS.filter(
		(string) => string !== target.string && openPitch(string) === target.pitch
	).map((string) => ({ direction: 'locate', string, pitch: openPitch(target.string) }));
}
