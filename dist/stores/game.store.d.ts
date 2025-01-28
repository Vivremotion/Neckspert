export interface GameState {
    isPlaying: boolean;
    countdown: number;
    score: number;
    timer: number;
}
export declare const gameStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<GameState>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    reset: () => void;
    updateTimer: (timer: number) => void;
    updateCountdown: (countdown: number) => void;
    setPlaying: (isPlaying: boolean) => void;
    incrementScore: (points: number) => void;
};
