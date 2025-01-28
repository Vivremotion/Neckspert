import type { Chord } from '../models';
export interface ChordsState {
    currentChord?: Chord;
    currentChordIndex?: number;
    chords: Chord[];
}
export declare const chordStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<ChordsState>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    addChord: (newChord: Chord) => void;
    removeChord: (id: string) => void;
    reorderChords: (fromIndex: number, toIndex: number) => void;
    setCurrentChord(id: string): void;
};
