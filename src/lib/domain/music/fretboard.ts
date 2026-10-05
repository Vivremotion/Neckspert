import {
	CHROMATIC_NOTES,
	MAX_PLAYABLE_FRET,
	STANDARD_TUNING,
	pitchOfMidi,
	type Midi,
	type PitchName,
	type StringNumber
} from '$lib/domain/music/types';
import type { LocateTarget } from '$lib/domain/types';
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
 * 0..MAX_PLAYABLE_FRET. `LocateTarget` is spelled out only so target literals still pass until
 * the stored model carries items.
 */
export function acceptableMidis(item: LocateItem | LocateTarget): Midi[] {
	return fretsForPitch(item.string, item.pitch).map((fret) => midiOnString(item.string, fret));
}
