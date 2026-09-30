import { CHROMATIC_NOTES, type PitchName } from '$lib/domain/music/types';
import type { Confusion } from '$lib/domain/types';

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

/** Null when the names match. Delta is the signed pitch-class distance folded into −6..+5. */
export function classifyNameConfusion(expected: PitchName, answered: PitchName): Confusion | null {
	if (expected === answered) return null;
	const from = CHROMATIC_NOTES.indexOf(expected);
	const to = CHROMATIC_NOTES.indexOf(answered);
	const up = (to - from + OCTAVE) % OCTAVE;
	return fromDistance(up >= OCTAVE / 2 ? up - OCTAVE : up);
}
