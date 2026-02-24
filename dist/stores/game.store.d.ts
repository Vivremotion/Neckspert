export interface GameState {
    isPlaying: boolean;
    countdown: number;
    score: number;
    timer: number;
    randomMode: boolean;
    hideDiagram: boolean;
    currentBeat: number;
    totalBeatsInChord: number;
}
export interface RhythmConfig {
    tempo: number;
}
export declare const gameStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<GameState>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    reset: () => void;
    updateTimer: (timer: number) => void;
    updateCountdown: (countdown: number) => void;
    setPlaying: (isPlaying: boolean) => void;
    incrementScore: (points: number) => void;
    setRandomMode: (randomMode: boolean) => void;
    setHideDiagram: (hideDiagram: boolean) => void;
    updateBeat: (currentBeat: number, totalBeatsInChord: number) => void;
};
export declare const rhythmConfigStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<RhythmConfig>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    setTempo: (tempo: number) => void;
};
