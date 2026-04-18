import type { PitchName } from './Pitch';

export const CHORD_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'maj9', 'dim', 'aug'] as const;
export type ChordQuality = string;

/** Pure harmonic identity: root pitch + quality label. No fingering information. */
export interface Chord {
	root: PitchName;
	quality: ChordQuality;
}

export function chordLabel(chord: Chord, displayRoot?: string): string {
	return `${displayRoot ?? chord.root}${chord.quality}`;
}
