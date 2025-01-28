import { writable } from 'svelte/store';

export interface GameState {
  isPlaying: boolean;
  countdown: number;
  score: number;
  timer: number;
}

function createGameStore() {
  const { subscribe, set, update } = writable<GameState>({
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
    updateTimer: (timer: number) => update(state => ({ ...state, timer })),
    updateCountdown: (countdown: number) => update(state => ({ ...state, countdown })),
    setPlaying: (isPlaying: boolean) => update(state => ({ ...state, isPlaying })),
    incrementScore: (points: number) => update(state => ({ ...state, score: state.score + points }))
  };
}

export const gameStore = createGameStore(); 