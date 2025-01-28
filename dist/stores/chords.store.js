import persistedStore from './persistedStore.js';
function createChordStore() {
    const { subscribe, update } = persistedStore('chordsState', { chords: [] });
    return {
        subscribe,
        addChord: (newChord) => {
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
        removeChord: (id) => {
            update(chordState => {
                const updatedChords = chordState.chords.filter(chord => chord.id !== id);
                return {
                    ...chordState,
                    currentChord: chordState.currentChord?.id !== id ? chordState.currentChord : updatedChords.at(-1),
                    currentChordIndex: chordState.currentChord?.id !== id ? chordState.currentChordIndex : updatedChords.length - 1,
                    chords: updatedChords
                };
            });
        },
        reorderChords: (fromIndex, toIndex) => {
            update(chordState => {
                const reorderedChords = [...chordState.chords];
                const [removed] = reorderedChords.splice(fromIndex, 1);
                reorderedChords.splice(toIndex, 0, removed);
                return { ...chordState, chords: reorderedChords };
            });
        },
        setCurrentChord(id) {
            update(chordState => ({
                ...chordState,
                currentChord: chordState.chords.find(chord => chord.id === id),
                currentChordIndex: chordState.chords.findIndex(chord => chord.id === id)
            }));
        }
    };
}
export const chordStore = createChordStore();
