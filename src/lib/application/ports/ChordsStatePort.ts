import type { Chord } from '$lib/models';

export interface ChordsStateSnapshot {
	readonly chords: Chord[];
	readonly currentChord?: Chord;
}

/**
 * Driven port: provides chord progression state and allows setting the current chord.
 */
export interface ChordsStatePort {
	subscribe(listener: (state: ChordsStateSnapshot) => void): void;
	setCurrentChord(chordId: string): void;
}
