import { getChordBeats } from '../models';
import { compareHPCP } from '../domain/hpcp';
import { groupIntoBars, generateRandomBar } from '../utils/barUtils';
const COUNTOFF_BEATS = 4;
const TIMER_INTERVAL_MS = 10;
const SESSION_DURATION_MS = 5 * 60 * 1000;
const CHORD_WINDOW_DURATION_MS = 150;
/**
 * Application service: orchestrates a chord practice session (count-off, beats,
 * chord progression, detection scoring). Depends on ports only (hexagonal).
 */
export class TrainerManager {
    chordsStatePort;
    gameStatePort;
    rhythmDisplayPort;
    beatSourcePort;
    chordDetectionPort;
    chordsState = { chords: [] };
    expectedHPCP = [];
    beatInChord = 0;
    hasStartedFirstChord = false;
    chordDetectedThisWindow = false;
    chordDetectionElapsed = 0;
    chordWindowStartMs = 0;
    countoffRemaining = 0;
    timerIntervalId = null;
    sessionTimeoutId = null;
    bars = [];
    currentBarIndex = -1;
    currentChordIndexInBar = 0;
    randomNextBar = null;
    randomCurrentBar = null;
    /** Mode used for bar/chord advancement; may lag `gameState.randomMode` until the next chord boundary. */
    progressionRandomMode = false;
    constructor(ports) {
        this.chordsStatePort = ports.chordsState;
        this.gameStatePort = ports.gameState;
        this.rhythmDisplayPort = ports.rhythmDisplay;
        this.beatSourcePort = ports.beatSource;
        this.chordDetectionPort = ports.chordDetection;
        this.chordsStatePort.subscribe((state) => {
            this.chordsState = state;
            this.expectedHPCP = state.currentChord?.hpcp ?? [];
        });
        this.chordDetectionPort.subscribe(this.onDetectedHPCP.bind(this));
        this.beatSourcePort.onBeat(this.onBeat.bind(this));
    }
    async start() {
        if (this.chordsState.chords.length === 0)
            return;
        this.clearSessionTimeout();
        this.sessionTimeoutId = setTimeout(() => {
            this.pause();
        }, SESSION_DURATION_MS);
        await this.chordDetectionPort.start();
        const tempo = this.gameStatePort.getTempo();
        this.beatSourcePort.setTempo(tempo);
        this.gameStatePort.reset();
        this.gameStatePort.setPlaying(true);
        this.rhythmDisplayPort.reset();
        this.countoffRemaining = COUNTOFF_BEATS;
        this.hasStartedFirstChord = false;
        this.beatInChord = 0;
        this.chordDetectedThisWindow = false;
        this.chordDetectionElapsed = 0;
        this.bars = groupIntoBars(this.chordsState.chords);
        this.currentBarIndex = -1;
        this.currentChordIndexInBar = 0;
        this.randomCurrentBar = null;
        this.randomNextBar = null;
        await this.beatSourcePort.start();
    }
    pause() {
        this.gameStatePort.setPlaying(false);
        this.beatSourcePort.stop();
        this.clearTimer();
        this.chordDetectionPort.pause();
        this.clearSessionTimeout();
    }
    setRandomMode(randomMode) {
        this.gameStatePort.setRandomMode(randomMode);
    }
    /** Apply persisted tempo to the beat source (call while playing after tempo changes). */
    refreshBeatTempo() {
        this.beatSourcePort.setTempo(this.gameStatePort.getTempo());
    }
    setHideDiagram(hideDiagram) {
        this.gameStatePort.setHideDiagram(hideDiagram);
    }
    onBeat() {
        if (this.countoffRemaining > 0) {
            this.gameStatePort.updateCountdown(this.countoffRemaining);
            this.countoffRemaining--;
            return;
        }
        if (!this.hasStartedFirstChord) {
            this.hasStartedFirstChord = true;
            this.gameStatePort.updateCountdown(0);
            this.initFirstChord();
            return;
        }
        this.beatInChord++;
        const currentChord = this.chordsState.currentChord;
        if (!currentChord)
            return;
        const chordBeats = getChordBeats(currentChord);
        this.gameStatePort.updateBeat(this.beatInChord, chordBeats);
        if (this.beatInChord >= chordBeats) {
            this.finalizeChord();
            this.advanceToNextChord();
        }
    }
    initFirstChord() {
        this.progressionRandomMode = this.gameStatePort.getState().randomMode;
        this.seedProgressionForMode(this.progressionRandomMode);
        this.beatInChord = 0;
        this.startTimer();
        const currentChord = this.chordsState.currentChord;
        if (currentChord) {
            this.gameStatePort.updateBeat(0, getChordBeats(currentChord));
        }
    }
    finalizeChord() {
        if (!this.chordDetectedThisWindow)
            return;
        const currentChord = this.chordsState.currentChord;
        if (!currentChord)
            return;
        const calibrationOffset = this.gameStatePort.getCalibrationOffsetMs();
        const effectiveElapsed = Math.max(0, this.chordDetectionElapsed - calibrationOffset);
        const ratio = Math.max(0, 1 - effectiveElapsed / CHORD_WINDOW_DURATION_MS);
        const points = Math.round(ratio * 10);
        this.gameStatePort.incrementScore(points);
    }
    advanceToNextChord() {
        this.beatInChord = 0;
        this.chordDetectedThisWindow = false;
        this.chordDetectionElapsed = 0;
        const desiredRandom = this.gameStatePort.getState().randomMode;
        if (desiredRandom !== this.progressionRandomMode) {
            this.progressionRandomMode = desiredRandom;
            this.seedProgressionForMode(this.progressionRandomMode);
            this.startTimer();
            const currentChord = this.chordsState.currentChord;
            if (currentChord) {
                this.gameStatePort.updateBeat(0, getChordBeats(currentChord));
            }
            return;
        }
        if (this.progressionRandomMode) {
            this.advanceRandomMode();
        }
        else {
            this.advanceSequentialMode();
        }
        this.startTimer();
        const currentChord = this.chordsState.currentChord;
        if (currentChord) {
            this.gameStatePort.updateBeat(0, getChordBeats(currentChord));
        }
    }
    /**
     * (Re)initializes bar indices and UI for the active random/sequential mode.
     * Used at session start and when applying a deferred mode switch at a chord boundary.
     */
    seedProgressionForMode(isRandom) {
        if (this.chordsState.chords.length === 0)
            return;
        if (isRandom) {
            this.randomCurrentBar = generateRandomBar(this.chordsState.chords);
            this.randomNextBar = generateRandomBar(this.chordsState.chords);
            this.currentChordIndexInBar = 0;
            this.rhythmDisplayPort.setCurrentBar(this.randomCurrentBar);
            this.rhythmDisplayPort.setNextBar(this.randomNextBar);
            const firstChord = this.findChordByName(this.randomCurrentBar.chords[0].name);
            if (firstChord?.id) {
                this.chordsStatePort.setCurrentChord(firstChord.id);
                this.rhythmDisplayPort.setActiveChord(this.randomCurrentBar.chords[0].id);
            }
        }
        else {
            this.bars = groupIntoBars(this.chordsState.chords);
            this.currentBarIndex = 0;
            this.currentChordIndexInBar = 0;
            const currentBar = this.bars[0];
            const nextBar = this.bars.length > 1 ? this.bars[1] : this.bars[0];
            this.rhythmDisplayPort.setCurrentBar(currentBar);
            this.rhythmDisplayPort.setNextBar(nextBar);
            const firstChord = this.chordsState.chords[0];
            if (firstChord?.id) {
                this.chordsStatePort.setCurrentChord(firstChord.id);
                this.rhythmDisplayPort.setActiveChord(currentBar?.chords[0]?.id ?? null);
            }
        }
    }
    advanceSequentialMode() {
        const currentBar = this.bars[this.currentBarIndex];
        if (!currentBar) {
            this.seedProgressionForMode(false);
            return;
        }
        this.currentChordIndexInBar++;
        if (this.currentChordIndexInBar >= currentBar.chords.length) {
            this.currentBarIndex = (this.currentBarIndex + 1) % this.bars.length;
            this.currentChordIndexInBar = 0;
            const newCurrentBar = this.bars[this.currentBarIndex];
            const nextBarIndex = (this.currentBarIndex + 1) % this.bars.length;
            const newNextBar = this.bars[nextBarIndex];
            this.rhythmDisplayPort.setCurrentBar(newCurrentBar);
            this.rhythmDisplayPort.setNextBar(newNextBar);
        }
        const activeBar = this.bars[this.currentBarIndex];
        const activeBarChord = activeBar.chords[this.currentChordIndexInBar];
        const matchingChord = this.chordsState.chords.find((c) => c.id === activeBarChord.id);
        if (matchingChord?.id) {
            this.chordsStatePort.setCurrentChord(matchingChord.id);
        }
        this.rhythmDisplayPort.setActiveChord(activeBarChord.id);
    }
    advanceRandomMode() {
        if (!this.randomCurrentBar)
            return;
        this.currentChordIndexInBar++;
        if (this.currentChordIndexInBar >= this.randomCurrentBar.chords.length) {
            this.randomCurrentBar = this.randomNextBar;
            this.randomNextBar = generateRandomBar(this.chordsState.chords);
            this.currentChordIndexInBar = 0;
            this.rhythmDisplayPort.setCurrentBar(this.randomCurrentBar);
            this.rhythmDisplayPort.setNextBar(this.randomNextBar);
        }
        const activeBarChord = this.randomCurrentBar.chords[this.currentChordIndexInBar];
        const matchingChord = this.findChordByName(activeBarChord.name);
        if (matchingChord?.id) {
            this.chordsStatePort.setCurrentChord(matchingChord.id);
        }
        this.rhythmDisplayPort.setActiveChord(activeBarChord.id);
    }
    findChordByName(name) {
        return this.chordsState.chords.find((c) => `${c.root}${c.quality}` === name);
    }
    onDetectedHPCP(detectedHPCP, audioTimestampMs) {
        if (this.expectedHPCP.length === 0 ||
            this.countoffRemaining > 0 ||
            !this.hasStartedFirstChord)
            return;
        if (this.chordDetectedThisWindow)
            return;
        const result = compareHPCP(this.expectedHPCP, detectedHPCP);
        if (result.isSimilar) {
            this.chordDetectedThisWindow = true;
            this.chordDetectionElapsed = Math.max(0, audioTimestampMs - this.chordWindowStartMs);
        }
    }
    startTimer() {
        this.clearTimer();
        this.gameStatePort.updateTimer(0);
        this.chordWindowStartMs = performance.now();
        this.timerIntervalId = setInterval(() => {
            const current = this.gameStatePort.getState().timer;
            this.gameStatePort.updateTimer(current + TIMER_INTERVAL_MS);
        }, TIMER_INTERVAL_MS);
    }
    clearTimer() {
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }
    }
    clearSessionTimeout() {
        if (this.sessionTimeoutId) {
            clearTimeout(this.sessionTimeoutId);
            this.sessionTimeoutId = null;
        }
    }
}
