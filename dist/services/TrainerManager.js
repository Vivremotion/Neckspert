import { get } from 'svelte/store';
import { DEFAULT_CHORD_DURATION_BEATS } from '../models/Chord';
import { chordStore } from '../stores/chords.store';
import { gameStore, RHYTHM_TOLERANCE_BEATS } from '../stores/game.store';
import { hpcpDetector } from './HPCPDetector/HPCPDetector';
const SIMILARITY_THRESHOLD = .85;
const DIFFERENCE_THRESHOLD = .1;
export class TrainerManager {
    expectedHPCP = Array(12);
    chordsState;
    countdownIntervalId = null;
    timerIntervalId = null;
    /** When the rhythm grid started (after countdown). Used for timing precision. */
    rhythmStartTime = 0;
    /** Cumulative beats at which each chord starts (for rhythm mode). */
    chordStartBeats = [];
    constructor() {
        chordStore.subscribe((update) => {
            this.chordsState = update;
            this.expectedHPCP = update?.currentChord?.hpcp;
        });
        hpcpDetector.subscribe(this.onDetectedHPCP.bind(this));
    }
    buildChordStartBeats() {
        const starts = [0];
        for (let i = 0; i < this.chordsState.chords.length; i++) {
            const duration = this.chordsState.chords[i]?.durationBeats ?? DEFAULT_CHORD_DURATION_BEATS;
            starts.push(starts[i] + duration);
        }
        return starts;
    }
    async start() {
        if (this.chordsState.chords.length === 0)
            return;
        await hpcpDetector.start();
        gameStore.reset();
        this.chordStartBeats = this.buildChordStartBeats();
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
                this.rhythmStartTime = performance.now();
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
    setRandomMode(randomMode) {
        gameStore.setRandomMode(randomMode);
    }
    setHideDiagram(hideDiagram) {
        gameStore.setHideDiagram(hideDiagram);
    }
    onDetectedHPCP(detectedHPCP) {
        if (!this.expectedHPCP)
            return;
        const hpcpComparisonResult = this.compareHPCP(this.expectedHPCP, detectedHPCP);
        if (hpcpComparisonResult.isSimilar) {
            const state = get(gameStore);
            let points;
            let feedback = null;
            if (state.rhythmMode && !state.randomMode && this.chordStartBeats.length > 0) {
                const now = performance.now();
                const bpm = state.tempoBpm;
                const elapsedMs = now - this.rhythmStartTime;
                const actualBeat = (elapsedMs / 1000) * (bpm / 60);
                const chordIndex = this.chordsState.currentChordIndex ?? 0;
                const expectedBeat = this.chordStartBeats[Math.min(chordIndex, this.chordStartBeats.length - 1)];
                const deltaBeats = actualBeat - expectedBeat;
                if (deltaBeats < -RHYTHM_TOLERANCE_BEATS) {
                    feedback = 'early';
                    points = 0;
                }
                else if (deltaBeats > RHYTHM_TOLERANCE_BEATS) {
                    feedback = 'late';
                    points = 0;
                }
                else {
                    feedback = 'on-time';
                    // Base 5 points, plus up to 2 bonus for being well centered in the window
                    const centerBonus = Math.max(0, 2 - Math.abs(deltaBeats) * 4);
                    points = Math.round(5 + centerBonus);
                }
                gameStore.setLastRhythmFeedback(feedback);
            }
            else {
                // Original: speed-based score (5 - timer, minimum 0)
                points = Math.max(0, 5 - state.timer);
            }
            gameStore.incrementScore(Math.round(points));
            this.setNextChord();
            this.startTimer();
        }
    }
    setNextChord(index) {
        if (get(gameStore).randomMode) {
            const nextChord = this.chordsState.chords[Math.floor(Math.random() * this.chordsState.chords.length)];
            chordStore.setCurrentChord(nextChord.id);
            return;
        }
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
