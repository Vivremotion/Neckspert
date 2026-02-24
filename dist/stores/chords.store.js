import { DEFAULT_DURATION, durationToBeats, beatsToDuration } from '../models';
import persistedStore from './persistedStore.js';
function migrateChord(chord) {
    if (chord.duration)
        return chord;
    return {
        ...chord,
        duration: chord.beats ? beatsToDuration(chord.beats) : DEFAULT_DURATION,
        beats: chord.beats
    };
}
function migrateState(state) {
    return {
        ...state,
        chords: state.chords.map(migrateChord),
        currentChord: state.currentChord ? migrateChord(state.currentChord) : undefined
    };
}
function createChordStore() {
    const persisted = persistedStore('chordsState', { chords: [] });
    const { subscribe, update } = persisted;
    // Migrate existing persisted data on first load
    update(migrateState);
    return {
        subscribe,
        addChord: (newChord) => {
            const duration = newChord.duration ?? DEFAULT_DURATION;
            const newChordWithId = {
                ...newChord,
                id: crypto.randomUUID(),
                duration,
                beats: durationToBeats(duration)
            };
            update(chordState => ({
                ...chordState,
                currentChord: newChordWithId,
                currentChordIndex: chordState.chords.length,
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
        },
        setChordDuration(id, duration) {
            const beats = durationToBeats(duration);
            update(chordState => ({
                ...chordState,
                chords: chordState.chords.map(chord => chord.id === id ? { ...chord, duration, beats } : chord),
                currentChord: chordState.currentChord?.id === id
                    ? { ...chordState.currentChord, duration, beats }
                    : chordState.currentChord
            }));
        },
        setChordBeats(id, beats) {
            const clamped = Math.max(1, Math.min(16, Math.round(beats)));
            const duration = beatsToDuration(clamped);
            update(chordState => ({
                ...chordState,
                chords: chordState.chords.map(chord => chord.id === id ? { ...chord, beats: clamped, duration } : chord),
                currentChord: chordState.currentChord?.id === id
                    ? { ...chordState.currentChord, beats: clamped, duration }
                    : chordState.currentChord
            }));
        }
    };
}
export const chordStore = createChordStore();
