import type { PitchName } from './Pitch';
import type { Position } from './Position';

export interface ShapeAnchor {
	fret: number;
	referencePitch: PitchName;
}

/**
 * A fingering template independent of any specific key.
 * Positions are stored relative to anchor.fret (i.e. as if baseFret=0).
 */
export interface Shape {
	id: string;
	label: string;
	positions: Position[];
	anchor: ShapeAnchor;
}
