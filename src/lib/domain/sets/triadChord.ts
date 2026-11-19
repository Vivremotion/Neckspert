import type { Voicing } from '$lib/domain/music';
import { classifyChordShape, type ChordConfusion } from '$lib/domain/families/guitar/chordShapes';

export type { ChordConfusion };

/** The chord sensor's reading, as the triad judges read it. */
export interface ChordReading {
	decided: string | null;
}

/** How the chord heard relates to the one asked (`position`: the shape asked, if any). */
export function classifyChord(
	asked: Voicing,
	position: number | 'open' | null,
	decided: string | null
): { correct: boolean; confusion: ChordConfusion | null } {
	return classifyChordShape(asked, position, decided);
}
