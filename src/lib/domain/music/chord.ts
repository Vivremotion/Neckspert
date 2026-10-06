import { formatSpelledNote, pitchOfSpelled, transposeSpelled, type SpelledNote } from './spelling';
import type { PitchName } from './types';

export type Degree = '1' | 'b3' | '3' | 'b5' | '5' | '#5' | '6' | 'b7' | '7';

/** Semitones above the root and letters above the root's letter. */
export const DEGREES: Readonly<Record<Degree, { semitones: number; letterSteps: number }>> = {
	'1': { semitones: 0, letterSteps: 0 },
	b3: { semitones: 3, letterSteps: 2 },
	'3': { semitones: 4, letterSteps: 2 },
	b5: { semitones: 6, letterSteps: 4 },
	'5': { semitones: 7, letterSteps: 4 },
	'#5': { semitones: 8, letterSteps: 4 },
	'6': { semitones: 9, letterSteps: 5 },
	b7: { semitones: 10, letterSteps: 6 },
	'7': { semitones: 11, letterSteps: 6 }
};

/** A named list of degrees. Data: a new quality is one more entry, no code. */
export interface ChordQuality {
	id: string;
	/** Written after the root: '' for major, 'm' for minor. */
	suffix: string;
	degrees: readonly Degree[];
}

/** Triad qualities. Sevenths come with the grids that need them. */
export const QUALITIES: readonly ChordQuality[] = [
	{ id: 'maj', suffix: '', degrees: ['1', '3', '5'] },
	{ id: 'min', suffix: 'm', degrees: ['1', 'b3', '5'] },
	{ id: 'dim', suffix: 'dim', degrees: ['1', 'b3', 'b5'] },
	{ id: 'aug', suffix: 'aug', degrees: ['1', '3', '#5'] }
];

export function qualityById(id: string): ChordQuality {
	const quality = QUALITIES.find((q) => q.id === id);
	if (!quality) throw new RangeError(`Unknown chord quality: ${id}`);
	return quality;
}

export interface Chord {
	/** Spelled: Eb and D# write the same chord differently. */
	root: SpelledNote;
	quality: ChordQuality;
}

export interface ChordTone {
	degree: Degree;
	note: SpelledNote;
	pitch: PitchName;
}

/** The note a degree above the root, spelled from the root (Eb, b3 → Gb). */
export function spellInterval(root: SpelledNote, degree: Degree): SpelledNote {
	const { semitones, letterSteps } = DEGREES[degree];
	return transposeSpelled(root, semitones, letterSteps);
}

/** One tone per degree of the quality, in the quality's order. */
export function chordTones(chord: Chord): ChordTone[] {
	return chord.quality.degrees.map((degree) => {
		const note = spellInterval(chord.root, degree);
		return { degree, note, pitch: pitchOfSpelled(note) };
	});
}

export function chordLabel(chord: Chord): string {
	return formatSpelledNote(chord.root) + chord.quality.suffix;
}
