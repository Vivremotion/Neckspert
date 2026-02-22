/** Default tempo in BPM (beats per minute). */
export declare const DEFAULT_TEMPO_BPM = 90;
/** Tolerance in beats: hit is "on time" if within ± this many beats of the expected time. */
export declare const RHYTHM_TOLERANCE_BEATS = 0.5;
export type RhythmFeedback = 'early' | 'late' | 'on-time' | null;
export interface GameState {
    isPlaying: boolean;
    countdown: number;
    score: number;
    timer: number;
    randomMode: boolean;
    hideDiagram: boolean;
    /** Tempo in BPM for rhythm mode (metronome). */
    tempoBpm: number;
    /** When true, score includes rhythm precision (expected beat window). */
    rhythmMode: boolean;
    /** Last rhythm feedback for UI: early / late / on-time. */
    lastRhythmFeedback: RhythmFeedback;
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
    setTempoBpm: (tempoBpm: number) => void;
    setRhythmMode: (rhythmMode: boolean) => void;
    setLastRhythmFeedback: (lastRhythmFeedback: RhythmFeedback) => void;
};
