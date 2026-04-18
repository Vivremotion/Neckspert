import type { Chord } from './Chord';
import type { Shape } from './Shape';
import type { Position } from './Position';
import type { PitchName } from './Pitch';

/**
 * A Chord rendered at a specific position on the fretboard using a Shape.
 * This is what the UI displays and what audio detection compares against.
 */
export interface Voicing {
	/** Stable ID: `${chord.root}${chord.quality}-${shape.id}` */
	id: string;
	chord: Chord;
	shape: Shape;
	/**
	 * Fret offset applied to all shape positions to produce positions.
	 * Derived from the target root and the shape anchor at generation time.
	 */
	baseFret: number;
	/** Resolved absolute positions (shape.positions with baseFret applied). */
	positions: Position[];
	/** Pitches present in this voicing (one per position). */
	pitches: PitchName[];
	/**
	 * HPCP binary vector (12 elements, one per chroma class).
	 * 1 if that pitch class is present, 0 otherwise.
	 */
	hpcp: number[];
	/**
	 * Display root override for enharmonic contexts (e.g. "Db" when chord.root is "C#").
	 */
	displayRoot?: string;
}
