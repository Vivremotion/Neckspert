import { CHROMATIC_NOTES, pitchOfMidi, type Midi, type PitchName } from '$lib/domain/music/types';
import type { Confusion, LocateTarget } from '$lib/domain/types';
import { acceptableMidis, pitchOnString } from './fretboard';
import type { LocateItem } from './items';

const OCTAVE = 12;

/** Farthest distance, in semitones, still counted as a near miss. */
const SEMITONE_CONFUSION_MAX = 2;

type SemitoneDelta = -2 | -1 | 1 | 2;

/** `semitones` is never 0: equal pitch classes are handled by the callers. */
function fromDistance(semitones: number): Confusion {
	return Math.abs(semitones) <= SEMITONE_CONFUSION_MAX
		? { kind: 'semitone', delta: semitones as SemitoneDelta }
		: { kind: 'other', semitones };
}

/** Null when the played note is acceptable. `LocateTarget`: as in `acceptableMidis`. */
export function classifyNoteConfusion(
	item: LocateItem | LocateTarget,
	playedMidi: Midi
): Confusion | null {
	const acceptable = acceptableMidis(item);
	if (acceptable.includes(playedMidi)) return null;
	if (pitchOfMidi(playedMidi) === item.pitch) return { kind: 'octave' };
	// The open note names the string in the prompt: playing it is a reading slip, not a fret off.
	if (pitchOfMidi(playedMidi) === pitchOnString(item.string, 0)) return { kind: 'string-name' };
	// `acceptable` is ascending and the comparison strict, so a tie keeps the lower note.
	const nearest = acceptable.reduce((best, midi) =>
		Math.abs(playedMidi - midi) < Math.abs(playedMidi - best) ? midi : best
	);
	return fromDistance(playedMidi - nearest);
}

/** Null when the names match. Delta is the signed pitch-class distance folded into −6..+5. */
export function classifyNameConfusion(expected: PitchName, answered: PitchName): Confusion | null {
	if (expected === answered) return null;
	const from = CHROMATIC_NOTES.indexOf(expected);
	const to = CHROMATIC_NOTES.indexOf(answered);
	const up = (to - from + OCTAVE) % OCTAVE;
	return fromDistance(up >= OCTAVE / 2 ? up - OCTAVE : up);
}
