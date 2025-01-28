import { writable } from 'svelte/store';
function createGameStore() {
    const { subscribe, set, update } = writable({
        isPlaying: false,
        countdown: 0,
        score: 0,
        timer: 0
    });
    return {
        subscribe,
        reset: () => {
            set({
                isPlaying: false,
                countdown: 5,
                score: 0,
                timer: 0
            });
        },
        updateTimer: (timer) => update(state => ({ ...state, timer })),
        updateCountdown: (countdown) => update(state => ({ ...state, countdown })),
        setPlaying: (isPlaying) => update(state => ({ ...state, isPlaying })),
        incrementScore: (points) => update(state => ({ ...state, score: state.score + points }))
    };
}
export const gameStore = createGameStore();
