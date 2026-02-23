import { writable } from 'svelte/store';
import persistedStore from './persistedStore.js';

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

function createGameStore() {
  const { subscribe, set, update } = writable<GameState>({
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
    updateTimer: (timer: number) => update(state => ({ ...state, timer })),
    updateCountdown: (countdown: number) => update(state => ({ ...state, countdown })),
    setPlaying: (isPlaying: boolean) => update(state => ({ ...state, isPlaying })),
    incrementScore: (points: number) => update(state => ({ ...state, score: state.score + points })),
    setRandomMode: (randomMode: boolean) => update(state => ({ ...state, randomMode })),
    setHideDiagram: (hideDiagram: boolean) => update(state => ({ ...state, hideDiagram })),
    updateBeat: (currentBeat: number, totalBeatsInChord: number) =>
      update(state => ({ ...state, currentBeat, totalBeatsInChord }))
  };
}

function createRhythmConfigStore() {
  const { subscribe, update } = persistedStore<RhythmConfig>('rhythmConfig', { tempo: 120 });

  return {
    subscribe,
    setTempo: (tempo: number) => update(state => ({ ...state, tempo: Math.max(20, Math.min(300, tempo)) }))
  };
}

export const gameStore = createGameStore();
export const rhythmConfigStore = createRhythmConfigStore();
