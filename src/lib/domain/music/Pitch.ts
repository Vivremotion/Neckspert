// Chromatic scale in sharp notation (canonical internal representation)
export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type PitchName = (typeof CHROMATIC_NOTES)[number];

export interface Pitch {
	name: PitchName;
}

// Map from flat spellings to sharp canonical name
const FLATS_TO_SHARPS: Record<string, PitchName> = {
	Db: 'C#',
	Eb: 'D#',
	Gb: 'F#',
	Ab: 'G#',
	Bb: 'A#'
};

const SHARPS_TO_FLATS: Record<PitchName, string> = {
	'C#': 'Db',
	'D#': 'Eb',
	'F#': 'Gb',
	'G#': 'Ab',
	'A#': 'Bb',
	C: 'C',
	D: 'D',
	E: 'E',
	F: 'F',
	G: 'G',
	A: 'A',
	B: 'B'
};

/** Normalise any note string (including flat spellings) to a canonical PitchName. */
export function normalizePitch(note: string): PitchName {
	const upper = note[0].toUpperCase() + note.slice(1);
	return (FLATS_TO_SHARPS[upper] ?? upper) as PitchName;
}

/** True if the string is a valid flat spelling. */
export function isFlat(note: string): boolean {
	return note in FLATS_TO_SHARPS;
}

/** Return the display name for a pitch given the context root's display form. */
export function getDisplayPitchName(pitch: PitchName, displayRoot: string | undefined): string {
	if (!displayRoot?.includes('b')) return pitch;
	return SHARPS_TO_FLATS[pitch] ?? pitch;
}

/** Semitone distance from one pitch to another (0-11). */
export function pitchDistance(from: PitchName, to: PitchName): number {
	const fi = CHROMATIC_NOTES.indexOf(from);
	const ti = CHROMATIC_NOTES.indexOf(to);
	return (ti - fi + 12) % 12;
}

/** Shift a pitch by `semitones` steps. */
export function shiftPitch(pitch: PitchName, semitones: number): PitchName {
	const index = CHROMATIC_NOTES.indexOf(pitch);
	return CHROMATIC_NOTES[((index + semitones) % 12 + 12) % 12];
}

/** Parse a chord-name prefix and return `{ root, displayRoot?, suffix }`. */
export function parseChordString(input: string): { root: PitchName; displayRoot?: string; suffix: string } | null {
	const match = input.match(/^([A-Ga-g][#b]?)(.*)$/);
	if (!match) return null;
	const raw = match[1][0].toUpperCase() + (match[1][1] ?? '');
	const suffix = match[2] ?? '';
	const root = normalizePitch(raw);
	return {
		root,
		displayRoot: raw !== root ? raw : undefined,
		suffix
	};
}
