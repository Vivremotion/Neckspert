import { CHROMATIC_NOTES, pitchDistance, shiftPitch } from './Pitch';
import type { PitchName } from './Pitch';
import type { Shape } from './Shape';
import type { Chord } from './Chord';
import type { Position } from './Position';
import type { Voicing } from './Voicing';

// Standard guitar tuning: string 1 = high e, string 6 = low E
const OPEN_STRINGS: PitchName[] = ['E', 'A', 'D', 'G', 'B', 'E'];

// Essentia's HPCP bins are anchored to A=440Hz, so the output order is
// alphabetical: A, A#, B, C, C#, D, D#, E, F, F#, G, G# (same as .sort()).
// The expected HPCP must use this same ordering for cosine similarity to work.
const HPCP_NOTE_ORDER = ([...CHROMATIC_NOTES] as PitchName[]).sort();

function openStringPitch(stringNumber: number): PitchName {
	return OPEN_STRINGS[6 - stringNumber];
}

function pitchAtFret(stringNumber: number, fret: number): PitchName {
	// Modulo 12 only here — pitch class is cyclic, physical fret positions are not
	return shiftPitch(openStringPitch(stringNumber), fret % 12);
}

/**
 * When baseFret = 0, a shape may mix open strings (fret 0) with high fretted
 * notes, making it physically unplayable. Lift open strings to fret 12
 * (same pitch class, one octave up).
 */
export function ensurePlayable(positions: Position[]): Position[] {
	const hasOpen = positions.some((p) => p.fret === 0);
	const maxFret = Math.max(...positions.map((p) => p.fret));
	if (hasOpen && maxFret > 5) {
		return positions.map((p) => ({ ...p, fret: p.fret === 0 ? 12 : p.fret }));
	}
	return positions;
}

/**
 * Apply a Shape to a target Chord and return a fully-resolved Voicing.
 *
 * Fret positions are NOT wrapped mod 12 — fret 14 and fret 2 play the same
 * pitch class but are completely different hand positions. Wrapping would
 * scatter notes across the neck for shapes transposed 10-11 semitones up.
 */
export function shapeToVoicing(shape: Shape, chord: Chord, displayRoot?: string): Voicing {
	const semitones = pitchDistance(shape.anchor.referencePitch, chord.root);

	// No % 12 — baseFret is a real neck offset, not a pitch class
	const baseFret = semitones + shape.anchor.fret;

	// Shift every position by baseFret without wrapping
	const shiftedPositions: Position[] = shape.positions.map((p) => ({
		...p,
		fret: p.fret + baseFret
	}));

	const positions = ensurePlayable(shiftedPositions);

	const pitches: PitchName[] = positions.map((p) => pitchAtFret(p.string, p.fret));

	// Use HPCP_NOTE_ORDER (A-based, alphabetical) to match Essentia's bin ordering
	const hpcp: number[] = HPCP_NOTE_ORDER.map((note) => (pitches.includes(note) ? 1 : 0));

	return {
		id: `${chord.root}${chord.quality}-${shape.id}`,
		chord,
		shape,
		baseFret,
		positions,
		pitches,
		hpcp,
		displayRoot
	};
}
