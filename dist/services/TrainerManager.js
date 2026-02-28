import { getChordBeats } from '../models';
import { compareHPCP } from '../domain/hpcp';
import { groupIntoBars, generateRandomBar } from '../utils/barUtils';
/** Number of count-in beats before the first chord. */
const COUNTOFF_BEATS = 4;
const TIMER_INTERVAL_MS = 10;
const TIMER_INCREMENT = 0.01;
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
    countoffRemaining = 0;
    timerIntervalId = null;
    bars = [];
    currentBarIndex = -1;
    currentChordIndexInBar = 0;
    randomNextBar = null;
    randomCurrentBar = null;
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
    }
    setRandomMode(randomMode) {
        this.gameStatePort.setRandomMode(randomMode);
    }
    setHideDiagram(hideDiagram) {
        this.gameStatePort.setHideDiagram(hideDiagram);
    }
    onBeat(absoluteBeat) {
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
        const isRandom = this.gameStatePort.getState().randomMode;
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
            this.currentBarIndex = 0;
            this.currentChordIndexInBar = 0;
            this.bars = groupIntoBars(this.chordsState.chords);
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
        const chordBeats = getChordBeats(currentChord);
        const windowDuration = chordBeats * this.beatSourcePort.getSecondsPerBeat();
        const ratio = Math.max(0, 1 - this.chordDetectionElapsed / windowDuration);
        const points = Math.round(ratio * 10);
        this.gameStatePort.incrementScore(points);
    }
    advanceToNextChord() {
        this.beatInChord = 0;
        this.chordDetectedThisWindow = false;
        this.chordDetectionElapsed = 0;
        const isRandom = this.gameStatePort.getState().randomMode;
        if (isRandom) {
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
    advanceSequentialMode() {
        const currentBar = this.bars[this.currentBarIndex];
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
    onDetectedHPCP(detectedHPCP) {
        if (this.expectedHPCP.length === 0 ||
            this.countoffRemaining > 0 ||
            !this.hasStartedFirstChord)
            return;
        if (this.chordDetectedThisWindow)
            return;
        const result = compareHPCP(this.expectedHPCP, detectedHPCP);
        if (result.isSimilar) {
            this.chordDetectedThisWindow = true;
            this.chordDetectionElapsed = this.gameStatePort.getState().timer;
        }
    }
    startTimer() {
        this.clearTimer();
        this.gameStatePort.updateTimer(0);
        this.timerIntervalId = setInterval(() => {
            const current = this.gameStatePort.getState().timer;
            this.gameStatePort.updateTimer(current + TIMER_INCREMENT);
        }, TIMER_INTERVAL_MS);
    }
    clearTimer() {
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }
    }
}
