import { writable } from 'svelte/store';
import persistedStore from './persistedStore.js';
function createGameStore() {
    const { subscribe, set, update } = writable({
        isPlaying: false,
        countdown: 0,
        score: 0,
        timer: 0,
        randomMode: false,
        hideDiagram: false,
        currentBeat: 0,
        totalBeatsInChord: 4
    });
    return {
        subscribe,
        reset: () => {
            update(state => ({
                ...state,
                isPlaying: false,
                countdown: 4,
                score: 0,
                timer: 0,
                currentBeat: 0,
                totalBeatsInChord: 4
            }));
        },
        updateTimer: (timer) => update(state => ({ ...state, timer })),
        updateCountdown: (countdown) => update(state => ({ ...state, countdown })),
        setPlaying: (isPlaying) => update(state => ({ ...state, isPlaying })),
        incrementScore: (points) => update(state => ({ ...state, score: state.score + points })),
        setRandomMode: (randomMode) => update(state => ({ ...state, randomMode })),
        setHideDiagram: (hideDiagram) => update(state => ({ ...state, hideDiagram })),
        updateBeat: (currentBeat, totalBeatsInChord) => update(state => ({ ...state, currentBeat, totalBeatsInChord }))
    };
}
function createRhythmConfigStore() {
    const { subscribe, update } = persistedStore('rhythmConfig', { tempo: 120 });
    return {
        subscribe,
        setTempo: (tempo) => update(state => ({ ...state, tempo: Math.max(20, Math.min(300, tempo)) }))
    };
}
export const gameStore = createGameStore();
export const rhythmConfigStore = createRhythmConfigStore();
