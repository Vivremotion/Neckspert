import { getContext } from 'svelte';
import { get } from 'svelte/store';
import { chordStore } from '../stores/chords.store';
import { gameStore } from '../stores/game.store';
import { hpcpDetector } from './HPCPDetector/HPCPDetector';
const SIMILARITY_THRESHOLD = .85;
const DIFFERENCE_THRESHOLD = .1;
export class TrainerManager {
    expectedHPCP = Array(12);
    chordsState;
    countdownIntervalId = null;
    timerIntervalId = null;
    constructor() {
        chordStore.subscribe((update) => {
            this.chordsState = update;
            this.expectedHPCP = update?.currentChord?.hpcp;
        });
        hpcpDetector.subscribe(this.onDetectedHPCP.bind(this));
    }
    async start() {
        if (this.chordsState.chords.length === 0)
            return;
        await hpcpDetector.start();
        gameStore.reset();
        // Start game
        gameStore.setPlaying(true);
        // Start countdown
        this.countdownIntervalId = setInterval(() => {
            const countdown = get(gameStore).countdown;
            if (countdown === 1) {
                if (this.countdownIntervalId) {
                    clearInterval(this.countdownIntervalId);
                    this.countdownIntervalId = null;
                }
                this.setNextChord(0);
                this.startTimer();
            }
            gameStore.updateCountdown(countdown - 1);
        }, 1000);
    }
    pause() {
        gameStore.setPlaying(false);
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = null;
            gameStore.updateCountdown(0);
        }
        hpcpDetector.pause();
    }
    onDetectedHPCP(detectedHPCP) {
        if (!this.expectedHPCP)
            return;
        const hpcpComparisonResult = this.compareHPCP(this.expectedHPCP, detectedHPCP);
        if (hpcpComparisonResult.isSimilar) {
            // Calculate score (5 - timer, minimum 0)
            const points = Math.max(0, 5 - get(gameStore).timer);
            gameStore.incrementScore(Math.round(points));
            this.setNextChord();
            this.startTimer();
        }
    }
    setNextChord(index) {
        const nextChord = this.chordsState.chords[index]
            || this.chordsState.chords[this.chordsState.currentChordIndex + 1]
            || this.chordsState.chords[0];
        chordStore.setCurrentChord(nextChord.id);
    }
    startTimer() {
        if (this.timerIntervalId)
            clearInterval(this.timerIntervalId);
        gameStore.updateTimer(0);
        this.timerIntervalId = setInterval(() => {
            gameStore.updateTimer(get(gameStore).timer + 0.01);
        }, 10);
    }
    compareHPCP(p1, p2, options = {}) {
        // Validate input
        if (p1.length !== p2.length) {
            throw new Error('HPCP profiles must have the same length');
        }
        // Default options
        const { similarityThreshold = SIMILARITY_THRESHOLD, differenceThreshold = DIFFERENCE_THRESHOLD } = options;
        // Calculate absolute differences
        const absoluteDifferences = p1.map((val1, index) => Math.abs(val1 - p2[index]));
        // Calculate average difference
        const averageDifference = absoluteDifferences.reduce((sum, diff) => sum + diff, 0) / p1.length;
        // Maximum difference
        const maxDifference = Math.max(...absoluteDifferences);
        // Identify significant difference indices
        const significantDifferenceIndices = absoluteDifferences
            .map((diff, index) => diff > differenceThreshold ? index : -1)
            .filter(index => index !== -1);
        // Cosine similarity calculation
        const dotProduct = p1.reduce((sum, val1, index) => sum + val1 * p2[index], 0);
        const magnitude1 = Math.sqrt(p1.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(p2.reduce((sum, val) => sum + val * val, 0));
        const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);
        // RMS difference
        const rmsDifference = Math.sqrt(absoluteDifferences.reduce((sum, diff) => sum + diff * diff, 0) / p1.length);
        return {
            isExactMatch: absoluteDifferences.every(diff => diff === 0),
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
