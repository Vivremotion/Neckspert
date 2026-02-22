import { writable } from 'svelte/store';
/** Default tempo in BPM (beats per minute). */
export const DEFAULT_TEMPO_BPM = 90;
/** Tolerance in beats: hit is "on time" if within ± this many beats of the expected time. */
export const RHYTHM_TOLERANCE_BEATS = 0.5;
function createGameStore() {
    const { subscribe, set, update } = writable({
        isPlaying: false,
        countdown: 0,
        score: 0,
        timer: 0,
        randomMode: false,
        hideDiagram: false,
        tempoBpm: DEFAULT_TEMPO_BPM,
        rhythmMode: false,
        lastRhythmFeedback: null
    });
    return {
        subscribe,
        reset: () => {
            update(state => ({
                ...state,
                isPlaying: false,
                countdown: 5,
                score: 0,
                timer: 0,
                randomMode: false,
                hideDiagram: false,
                lastRhythmFeedback: null
            }));
        },
        updateTimer: (timer) => update(state => ({ ...state, timer })),
        updateCountdown: (countdown) => update(state => ({ ...state, countdown })),
        setPlaying: (isPlaying) => update(state => ({ ...state, isPlaying })),
        incrementScore: (points) => update(state => ({ ...state, score: state.score + points })),
        setRandomMode: (randomMode) => update(state => ({ ...state, randomMode })),
        setHideDiagram: (hideDiagram) => update(state => ({ ...state, hideDiagram })),
        setTempoBpm: (tempoBpm) => update(state => ({ ...state, tempoBpm: Math.max(40, Math.min(240, tempoBpm)) })),
        setRhythmMode: (rhythmMode) => update(state => ({ ...state, rhythmMode })),
        setLastRhythmFeedback: (lastRhythmFeedback) => update(state => ({ ...state, lastRhythmFeedback }))
    };
}
export const gameStore = createGameStore();
