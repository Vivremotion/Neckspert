// src/lib/stores/chords.store.ts
import type { Chord } from '$lib/models';
import persistedStore from './persistedStore.js';

export interface ChordsState {
  currentChord?: Chord;
  currentChordIndex?: number;
  chords: Chord[];
}

function createChordStore() {
  const { subscribe, update } = persistedStore<ChordsState>('chordsState', { chords: [] });

  return {
    subscribe,
    addChord: (newChord: Chord) => {
      const newChordWithId = {
        ...newChord,
        id: crypto.randomUUID()
      };
      update(chordState => ({
        ...chordState,
        currentChord: newChordWithId,
        currentChordIndex: chordState.chords.length - 1,
        chords: [...chordState.chords, newChordWithId]
      }));
    },
    removeChord: (id: string) => {
      update(chordState => {
        const updatedChords = chordState.chords.filter(chord => chord.id !== id);
        return {
          ...chordState,
          currentChord: chordState.currentChord?.id !== id ? chordState.currentChord : updatedChords.at(-1),
          currentChordIndex: chordState.currentChord?.id !== id ? chordState.currentChordIndex : updatedChords.length - 1,
          chords: updatedChords
        }
      });
    },
    reorderChords: (fromIndex: number, toIndex: number) => {
      update(chordState => {
        const reorderedChords = [...chordState.chords];
        const [removed] = reorderedChords.splice(fromIndex, 1);
        reorderedChords.splice(toIndex, 0, removed);
        return { ...chordState, chords: reorderedChords };
      });
    },
    setCurrentChord(id: string) {
      update(chordState => ({
        ...chordState,
        currentChord: chordState.chords.find(chord => chord.id === id),
        currentChordIndex: chordState.chords.findIndex(chord => chord.id === id)
      }))
    }
  };
}

export const chordStore = createChordStore();