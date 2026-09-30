/** Chromatic scale in sharp notation: the canonical internal spelling. */
export const CHROMATIC_NOTES = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B'
] as const;

export type PitchName = (typeof CHROMATIC_NOTES)[number];

/** MIDI note number: 60 = C4, 64 = E4. */
export type Midi = number;

/** Guitar string: 1 = high E … 6 = low E. */
export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

export const STRING_NUMBERS: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];

export interface FretPosition {
	string: StringNumber;
	/** 0 = open string. */
	fret: number;
}

/** Open-string MIDI notes in standard tuning. */
export const STANDARD_TUNING: Readonly<Record<StringNumber, Midi>> = {
	1: 64,
	2: 59,
	3: 55,
	4: 50,
	5: 45,
	6: 40
};

/** Highest fret accepted as an answer in mode 1. */
export const MAX_PLAYABLE_FRET = 24;

/** Mode 2 prompts use frets 0 to 11; fret 12 repeats fret 0. */
export const MAX_PROMPT_FRET = 11;

export type Spelling = 'sharp' | 'flat';

/** A pitch with the spelling chosen for display (F# or Gb). */
export interface NoteLabel {
	pitch: PitchName;
	spelling: Spelling;
}

export function pitchOfMidi(midi: Midi): PitchName {
	return CHROMATIC_NOTES[((midi % 12) + 12) % 12];
}
