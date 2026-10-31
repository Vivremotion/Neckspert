import {
	CHROMATIC_NOTES,
	MAX_PLAYABLE_FRET,
	STANDARD_TUNING,
	pitchOfMidi,
	type Midi,
	type PitchName,
	type StringNumber
} from '$lib/domain/music/types';
import type { LocateItem } from './items';

const OCTAVE = 12;

function assertFret(fret: number): void {
	if (!Number.isInteger(fret) || fret < 0 || fret > MAX_PLAYABLE_FRET) {
		throw new RangeError(`Fret must be an integer from 0 to ${MAX_PLAYABLE_FRET}: ${fret}`);
	}
}

export function midiOnString(string: StringNumber, fret: number): Midi {
	assertFret(fret);
	return STANDARD_TUNING[string] + fret;
}

export function pitchOnString(string: StringNumber, fret: number): PitchName {
	return pitchOfMidi(midiOnString(string, fret));
}

/** Frets 0..maxFret on `string` whose pitch is `pitch`, ascending. */
export function fretsForPitch(
	string: StringNumber,
	pitch: PitchName,
	maxFret: number = MAX_PLAYABLE_FRET
): number[] {
	assertFret(maxFret);
	const openPitchClass = STANDARD_TUNING[string] % OCTAVE;
	const lowestFret = (CHROMATIC_NOTES.indexOf(pitch) - openPitchClass + OCTAVE) % OCTAVE;
	const frets: number[] = [];
	for (let fret = lowestFret; fret <= maxFret; fret += OCTAVE) frets.push(fret);
	return frets;
}

/**
 * MIDI notes accepted for a locate item: every octave of the pitch on that string, frets
 * 0..MAX_PLAYABLE_FRET.
 */
export function acceptableMidis(item: LocateItem): Midi[] {
	return fretsForPitch(item.string, item.pitch).map((fret) => midiOnString(item.string, fret));
}

/**
 * The fret where `pitch` (MIDI) is played on `string` in standard tuning, from 0 (open) to
 * MAX_PLAYABLE_FRET; else what keeps the note from having one, told of the note (« has no
 * string »), for its caller to name it.
 */
export function fretOf(
	pitch: number | undefined,
	string: number | undefined
): { fret: number } | { problem: string } {
	if (string === undefined) return { problem: 'has no string' };
	if (pitch === undefined) return { problem: 'has no pitch' };
	if (!Object.hasOwn(STANDARD_TUNING, string)) {
		return { problem: `is on string ${string}, which the guitar does not have` };
	}
	const open = STANDARD_TUNING[string as StringNumber];
	if (pitch < open) return { problem: `(pitch ${pitch}) is below string ${string} (${open})` };
	if (pitch - open > MAX_PLAYABLE_FRET) {
		return {
			problem: `(pitch ${pitch}) is above the last fret of string ${string} (${MAX_PLAYABLE_FRET})`
		};
	}
	return { fret: pitch - open };
}
