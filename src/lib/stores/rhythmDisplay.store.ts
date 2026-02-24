import { writable } from 'svelte/store';
import type { Bar } from '$lib/utils/barUtils';

export interface RhythmDisplayState {
	currentBar: Bar | null;
	nextBar: Bar | null;
	activeChordId: string | null;
	transitioning: boolean;
}

function createRhythmDisplayStore() {
	const { subscribe, set, update } = writable<RhythmDisplayState>({
		currentBar: null,
		nextBar: null,
		activeChordId: null,
		transitioning: false
	});

	return {
		subscribe,
		setCurrentBar: (bar: Bar) =>
			update((s) => ({ ...s, currentBar: bar })),
		setNextBar: (bar: Bar | null) =>
			update((s) => ({ ...s, nextBar: bar })),
		setActiveChord: (chordId: string | null) =>
			update((s) => ({ ...s, activeChordId: chordId })),
		advance: (newNext: Bar | null) =>
			update((s) => ({
				...s,
				transitioning: true,
				currentBar: s.nextBar,
				nextBar: newNext,
				activeChordId: null
			})),
		finishTransition: () =>
			update((s) => ({ ...s, transitioning: false })),
		reset: () =>
			set({
				currentBar: null,
				nextBar: null,
				activeChordId: null,
				transitioning: false
			})
	};
}

export const rhythmDisplayStore = createRhythmDisplayStore();
