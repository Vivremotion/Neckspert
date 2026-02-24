import { get } from 'svelte/store';
import type { HPCPComparisonResult, Chord } from '$lib/models';
import { getChordBeats } from '$lib/models';
import { chordStore, type ChordsState } from '$lib/stores/chords.store';
import { gameStore, rhythmConfigStore } from '$lib/stores/game.store';
import { rhythmDisplayStore } from '$lib/stores/rhythmDisplay.store';
import { hpcpDetector } from '$lib/services/HPCPDetector/HPCPDetector';
import { Metronome } from '$lib/services/Metronome';
import {
	groupIntoBars,
	generateRandomBar,
	type Bar
} from '$lib/utils/barUtils';

const SIMILARITY_THRESHOLD = 0.85;
const DIFFERENCE_THRESHOLD = 0.1;
const COUNTOFF_BEATS = 4;

export class TrainerManager {
	private expectedHPCP: Array<number> = Array(12);
	private chordsState: ChordsState;
	private metronome = new Metronome();

	private beatInChord = 0;
	private chordDetectedThisWindow = false;
	private chordDetectionElapsed = 0;
	private countoffRemaining = 0;
	private timerIntervalId: ReturnType<typeof setInterval> | null = null;

	private bars: Bar[] = [];
	private currentBarIndex = -1;
	private currentChordIndexInBar = 0;
	private randomNextBar: Bar | null = null;
	private randomCurrentBar: Bar | null = null;

	constructor() {
		chordStore.subscribe((update: ChordsState) => {
			this.chordsState = update;
			this.expectedHPCP = update?.currentChord?.hpcp;
		});

		hpcpDetector.subscribe(this.onDetectedHPCP.bind(this));
		this.metronome.onBeat(this.onBeat.bind(this));
	}

	async start() {
		if (this.chordsState.chords.length === 0) return;
		await hpcpDetector.start();

		const tempo = get(rhythmConfigStore).tempo;
		this.metronome.setTempo(tempo);

		gameStore.reset();
		gameStore.setPlaying(true);
		rhythmDisplayStore.reset();

		this.countoffRemaining = COUNTOFF_BEATS;
		this.beatInChord = 0;
		this.chordDetectedThisWindow = false;
		this.chordDetectionElapsed = 0;

		this.bars = groupIntoBars(this.chordsState.chords);
		this.currentBarIndex = -1;
		this.currentChordIndexInBar = 0;
		this.randomCurrentBar = null;
		this.randomNextBar = null;

		await this.metronome.start();
	}

	pause() {
		gameStore.setPlaying(false);
		this.metronome.stop();
		this.clearTimer();
		hpcpDetector.pause();
	}

	setRandomMode(randomMode: boolean) {
		gameStore.setRandomMode(randomMode);
	}

	setHideDiagram(hideDiagram: boolean) {
		gameStore.setHideDiagram(hideDiagram);
	}

	private onBeat(absoluteBeat: number) {
		if (this.countoffRemaining > 0) {
			gameStore.updateCountdown(this.countoffRemaining);
			this.countoffRemaining--;

			if (this.countoffRemaining === 0) {
				gameStore.updateCountdown(0);
				this.initFirstChord();
			}
			return;
		}

		this.beatInChord++;
		const chordBeats = getChordBeats(this.chordsState.currentChord!);
		gameStore.updateBeat(this.beatInChord, chordBeats);

		if (this.beatInChord >= chordBeats) {
			this.finalizeChord();
			this.advanceToNextChord();
		}
	}

	private initFirstChord() {
		const isRandom = get(gameStore).randomMode;

		if (isRandom) {
			this.randomCurrentBar = generateRandomBar(this.chordsState.chords);
			this.randomNextBar = generateRandomBar(this.chordsState.chords);
			this.currentChordIndexInBar = 0;

			rhythmDisplayStore.setCurrentBar(this.randomCurrentBar);
			rhythmDisplayStore.setNextBar(this.randomNextBar);

			const firstChord = this.findChordByName(this.randomCurrentBar.chords[0].name);
			if (firstChord) {
				chordStore.setCurrentChord(firstChord.id!);
				rhythmDisplayStore.setActiveChord(this.randomCurrentBar.chords[0].id);
			}
		} else {
			this.currentBarIndex = 0;
			this.currentChordIndexInBar = 0;
			this.bars = groupIntoBars(this.chordsState.chords);

			const currentBar = this.bars[0];
			const nextBar = this.bars.length > 1 ? this.bars[1] : this.bars[0];

			rhythmDisplayStore.setCurrentBar(currentBar);
			rhythmDisplayStore.setNextBar(nextBar);

			const firstChord = this.chordsState.chords[0];
			if (firstChord) {
				chordStore.setCurrentChord(firstChord.id!);
				rhythmDisplayStore.setActiveChord(currentBar?.chords[0]?.id ?? null);
			}
		}

		this.beatInChord = 0;
		this.startTimer();
		const chordBeats = getChordBeats(this.chordsState.currentChord!);
		gameStore.updateBeat(0, chordBeats);
	}

	private finalizeChord() {
		if (this.chordDetectedThisWindow) {
			const chordBeats = getChordBeats(this.chordsState.currentChord!);
			const windowDuration = chordBeats * this.metronome.getSecondsPerBeat();
			const ratio = Math.max(0, 1 - this.chordDetectionElapsed / windowDuration);
			const points = Math.round(ratio * 10);
			gameStore.incrementScore(points);
		}
	}

	private advanceToNextChord() {
		this.beatInChord = 0;
		this.chordDetectedThisWindow = false;
		this.chordDetectionElapsed = 0;

		const isRandom = get(gameStore).randomMode;

		if (isRandom) {
			this.advanceRandomMode();
		} else {
			this.advanceSequentialMode();
		}

		this.startTimer();
		const chordBeats = getChordBeats(this.chordsState.currentChord!);
		gameStore.updateBeat(0, chordBeats);
	}

	private advanceSequentialMode() {
		const currentBar = this.bars[this.currentBarIndex];
		this.currentChordIndexInBar++;

		if (this.currentChordIndexInBar >= currentBar.chords.length) {
			this.currentBarIndex = (this.currentBarIndex + 1) % this.bars.length;
			this.currentChordIndexInBar = 0;

			const newCurrentBar = this.bars[this.currentBarIndex];
			const nextBarIndex = (this.currentBarIndex + 1) % this.bars.length;
			const newNextBar = this.bars[nextBarIndex];

			rhythmDisplayStore.setCurrentBar(newCurrentBar);
			rhythmDisplayStore.setNextBar(newNextBar);
		}

		const activeBar = this.bars[this.currentBarIndex];
		const activeBarChord = activeBar.chords[this.currentChordIndexInBar];

		const matchingChord = this.chordsState.chords.find((c) => c.id === activeBarChord.id);
		if (matchingChord) {
			chordStore.setCurrentChord(matchingChord.id!);
		}

		rhythmDisplayStore.setActiveChord(activeBarChord.id);
	}

	private advanceRandomMode() {
		if (!this.randomCurrentBar) return;

		this.currentChordIndexInBar++;

		if (this.currentChordIndexInBar >= this.randomCurrentBar.chords.length) {
			this.randomCurrentBar = this.randomNextBar;
			this.randomNextBar = generateRandomBar(this.chordsState.chords);
			this.currentChordIndexInBar = 0;

			rhythmDisplayStore.setCurrentBar(this.randomCurrentBar!);
			rhythmDisplayStore.setNextBar(this.randomNextBar);
		}

		const activeBarChord = this.randomCurrentBar!.chords[this.currentChordIndexInBar];
		const matchingChord = this.findChordByName(activeBarChord.name);
		if (matchingChord) {
			chordStore.setCurrentChord(matchingChord.id!);
		}

		rhythmDisplayStore.setActiveChord(activeBarChord.id);
	}

	private findChordByName(name: string): Chord | undefined {
		return this.chordsState.chords.find(
			(c) => `${c.root}${c.quality}` === name
		);
	}

	private onDetectedHPCP(detectedHPCP: Array<number>) {
		if (!this.expectedHPCP || this.countoffRemaining > 0) return;
		if (this.chordDetectedThisWindow) return;

		const result = this.compareHPCP(this.expectedHPCP, detectedHPCP);

		if (result.isSimilar) {
			this.chordDetectedThisWindow = true;
			this.chordDetectionElapsed = get(gameStore).timer;
		}
	}

	private startTimer() {
		this.clearTimer();
		gameStore.updateTimer(0);

		this.timerIntervalId = setInterval(() => {
			gameStore.updateTimer(get(gameStore).timer + 0.01);
		}, 10);
	}

	private clearTimer() {
		if (this.timerIntervalId) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
	}

	private compareHPCP(
		p1: number[],
		p2: number[],
		options: {
			similarityThreshold?: number;
			differenceThreshold?: number;
		} = {}
	): HPCPComparisonResult {
		if (p1.length !== p2.length) {
			throw new Error('HPCP profiles must have the same length');
		}

		const {
			similarityThreshold = SIMILARITY_THRESHOLD,
			differenceThreshold = DIFFERENCE_THRESHOLD
		} = options;

		const absoluteDifferences = p1.map((val1, index) => Math.abs(val1 - p2[index]));

		const averageDifference =
			absoluteDifferences.reduce((sum, diff) => sum + diff, 0) / p1.length;

		const maxDifference = Math.max(...absoluteDifferences);

		const significantDifferenceIndices = absoluteDifferences
			.map((diff, index) => (diff > differenceThreshold ? index : -1))
			.filter((index) => index !== -1);

		const dotProduct = p1.reduce((sum, val1, index) => sum + val1 * p2[index], 0);
		const magnitude1 = Math.sqrt(p1.reduce((sum, val) => sum + val * val, 0));
		const magnitude2 = Math.sqrt(p2.reduce((sum, val) => sum + val * val, 0));
		const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);

		const rmsDifference = Math.sqrt(
			absoluteDifferences.reduce((sum, diff) => sum + diff * diff, 0) / p1.length
		);

		return {
			isExactMatch: absoluteDifferences.every((diff) => diff === 0),
			isSimilar: cosineSimilarity >= similarityThreshold,
			absoluteDifferences,
			averageDifference,
			maxDifference,
			significantDifferenceIndices,
			cosineSimilarity,
			rmsDifference
		};
	}
}

export const trainerManager = new TrainerManager();
