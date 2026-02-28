import { get } from 'svelte/store';
import type { ChordsStatePort, ChordsStateSnapshot } from '$lib/application/ports/ChordsStatePort';
import type { GameStatePort, GameStateSnapshot } from '$lib/application/ports/GameStatePort';
import type { RhythmDisplayPort } from '$lib/application/ports/RhythmDisplayPort';
import { chordStore } from '$lib/stores/chords.store';
import { gameStore, rhythmConfigStore } from '$lib/stores/game.store';
import { rhythmDisplayStore } from '$lib/stores/rhythmDisplay.store';
import { calibrationDataStore } from '$lib/stores/calibration.store';

function toChordsSnapshot(state: { chords: unknown[]; currentChord?: unknown }): ChordsStateSnapshot {
	return {
		chords: state.chords as ChordsStateSnapshot['chords'],
		currentChord: state.currentChord as ChordsStateSnapshot['currentChord']
	};
}

export function createChordsStateAdapter(): ChordsStatePort {
	return {
		subscribe(listener) {
			listener(toChordsSnapshot(get(chordStore)));
			return chordStore.subscribe((state) => listener(toChordsSnapshot(state)));
		},
		setCurrentChord(id) {
			chordStore.setCurrentChord(id);
		}
	};
}

export function createGameStateAdapter(): GameStatePort {
	return {
		getState(): GameStateSnapshot {
			const state = get(gameStore);
			return { randomMode: state.randomMode, timer: state.timer };
		},
		getTempo() {
			return get(rhythmConfigStore).tempo;
		},
		getCalibrationOffsetMs() {
			const cal = get(calibrationDataStore);
			return cal?.offsetMs ?? 0;
		},
		reset() {
			gameStore.reset();
		},
		setPlaying(playing) {
			gameStore.setPlaying(playing);
		},
		updateCountdown(countdown) {
			gameStore.updateCountdown(countdown);
		},
		updateTimer(timer) {
			gameStore.updateTimer(timer);
		},
		incrementScore(points) {
			gameStore.incrementScore(points);
		},
		updateBeat(currentBeat, totalBeatsInChord) {
			gameStore.updateBeat(currentBeat, totalBeatsInChord);
		},
		setRandomMode(randomMode) {
			gameStore.setRandomMode(randomMode);
		},
		setHideDiagram(hideDiagram) {
			gameStore.setHideDiagram(hideDiagram);
		}
	};
}

export function createRhythmDisplayAdapter(): RhythmDisplayPort {
	return {
		reset() {
			rhythmDisplayStore.reset();
		},
		setCurrentBar(bar) {
			rhythmDisplayStore.setCurrentBar(bar);
		},
		setNextBar(bar) {
			rhythmDisplayStore.setNextBar(bar);
		},
		setActiveChord(chordId) {
			rhythmDisplayStore.setActiveChord(chordId);
		}
	};
}
