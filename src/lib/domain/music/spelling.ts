import { CHROMATIC_NOTES, type PitchName } from './types';

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** −2 to +2: bb, b, natural, #, ##. */
export type Accidental = -2 | -1 | 0 | 1 | 2;

/**
 * A note written as a letter and an accidental, as a chord spells it (Cb, E#, Bbb), unlike
 * `NoteLabel`, which only chooses between sharp and flat for a lone note.
 */
export interface SpelledNote {
	letter: Letter;
	accidental: Accidental;
}

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Semitones above C of each natural letter. */
const NATURAL_SEMITONES: Readonly<Record<Letter, number>> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
};

const OCTAVE = 12;
const MAX_ACCIDENTAL = 2;

function mod(value: number, n: number): number {
	return ((value % n) + n) % n;
}

function semitonesOf(note: SpelledNote): number {
	return mod(NATURAL_SEMITONES[note.letter] + note.accidental, OCTAVE);
}

export function pitchOfSpelled(note: SpelledNote): PitchName {
	return CHROMATIC_NOTES[semitonesOf(note)];
}

export function parseSpelledNote(text: string): SpelledNote {
	const match = /^([A-G])(#{1,2}|b{1,2})?$/.exec(text);
	if (!match) throw new RangeError(`Not a note name: "${text}"`);
	const marks = match[2] ?? '';
	const sign = marks.startsWith('#') ? 1 : -1;
	return { letter: match[1] as Letter, accidental: (sign * marks.length || 0) as Accidental };
}

export function formatSpelledNote(note: SpelledNote): string {
	const mark = note.accidental > 0 ? '#' : 'b';
	return note.letter + mark.repeat(Math.abs(note.accidental));
}

/** Sharp spelling of a pitch: 'D#' → D sharp. */
export function spelledFromPitch(pitch: PitchName): SpelledNote {
	return parseSpelledNote(pitch);
}

/**
 * The note `letterSteps` letters and `semitones` semitones above `root` (Eb, 3, 2 → Gb). Throws
 * when the result would need more than a double sharp or flat.
 */
export function transposeSpelled(
	root: SpelledNote,
	semitones: number,
	letterSteps: number
): SpelledNote {
	const letter = LETTERS[mod(LETTERS.indexOf(root.letter) + letterSteps, LETTERS.length)];
	const target = mod(semitonesOf(root) + semitones, OCTAVE);
	const accidental = mod(target - NATURAL_SEMITONES[letter] + OCTAVE / 2, OCTAVE) - OCTAVE / 2;
	if (Math.abs(accidental) > MAX_ACCIDENTAL) {
		throw new RangeError(
			`${formatSpelledNote(root)} + ${semitones} semitones over ${letterSteps} letters needs ${accidental} accidentals`
		);
	}
	return { letter, accidental: accidental as Accidental };
}
