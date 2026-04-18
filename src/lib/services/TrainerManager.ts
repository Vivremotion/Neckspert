import type { ChordInstance } from '$lib/domain/music';
import { durationToBeats } from '$lib/domain/music';
import type { ChordsStatePort, ChordsStateSnapshot } from '$lib/application/ports/ChordsStatePort';
import type { GameStatePort } from '$lib/application/ports/GameStatePort';
import type { RhythmDisplayPort } from '$lib/application/ports/RhythmDisplayPort';
import type { BeatSourcePort } from '$lib/application/ports/BeatSourcePort';
import type { ChordDetectionPort } from '$lib/application/ports/ChordDetectionPort';
import { compareHPCP } from '$lib/domain/hpcp';
import {
	groupIntoBars,
	generateRandomBar,
	type Bar
} from '$lib/utils/barUtils';

const COUNTOFF_BEATS = 4;
const TIMER_INTERVAL_MS = 10;
const SESSION_DURATION_MS = 5 * 60 * 1000;
const CHORD_WINDOW_DURATION_MS = 150;

export interface TrainerManagerPorts {
	chordsState: ChordsStatePort;
	gameState: GameStatePort;
	rhythmDisplay: RhythmDisplayPort;
	beatSource: BeatSourcePort;
	chordDetection: ChordDetectionPort;
}

function getInstanceBeats(instance: ChordInstance): number {
	return durationToBeats(instance.duration);
}

/**
 * Application service: orchestrates a chord practice session (count-off, beats,
 * chord progression, detection scoring). Depends on ports only (hexagonal).
 */
export class TrainerManager {
	private readonly chordsStatePort: ChordsStatePort;
	private readonly gameStatePort: GameStatePort;
	private readonly rhythmDisplayPort: RhythmDisplayPort;
	private readonly beatSourcePort: BeatSourcePort;
	private readonly chordDetectionPort: ChordDetectionPort;

	private chordsState: ChordsStateSnapshot = { instances: [] };
	private expectedHPCP: number[] = [];

	private beatInChord = 0;
	private hasStartedFirstChord = false;
	private chordDetectedThisWindow = false;
	private chordDetectionElapsed = 0;
	private chordWindowStartMs = 0;
	private countoffRemaining = 0;
	private timerIntervalId: ReturnType<typeof setInterval> | null = null;
	private sessionTimeoutId: ReturnType<typeof setTimeout> | null = null;

	private bars: Bar[] = [];
	private currentBarIndex = -1;
	private currentChordIndexInBar = 0;
	private randomNextBar: Bar | null = null;
	private randomCurrentBar: Bar | null = null;

	/** Mode used for bar/chord advancement; may lag `gameState.randomMode` until the next chord boundary. */
	private progressionRandomMode = false;

	constructor(ports: TrainerManagerPorts) {
		this.chordsStatePort = ports.chordsState;
		this.gameStatePort = ports.gameState;
		this.rhythmDisplayPort = ports.rhythmDisplay;
		this.beatSourcePort = ports.beatSource;
		this.chordDetectionPort = ports.chordDetection;

		this.chordsStatePort.subscribe((state: ChordsStateSnapshot) => {
			this.chordsState = state;
			this.expectedHPCP = state.currentInstance?.voicing.hpcp ?? [];
		});

		this.chordDetectionPort.subscribe(this.onDetectedHPCP.bind(this));
		this.beatSourcePort.onBeat(this.onBeat.bind(this));
	}

	async start(): Promise<void> {
		if (this.chordsState.instances.length === 0) return;

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

		this.bars = groupIntoBars(this.chordsState.instances);
		this.currentBarIndex = -1;
		this.currentChordIndexInBar = 0;
		this.randomCurrentBar = null;
		this.randomNextBar = null;

		await this.beatSourcePort.start();
	}

	pause(): void {
		this.gameStatePort.setPlaying(false);
		this.beatSourcePort.stop();
		this.clearTimer();
		this.chordDetectionPort.pause();
		this.clearSessionTimeout();
	}

	setRandomMode(randomMode: boolean): void {
		this.gameStatePort.setRandomMode(randomMode);
	}

	/** Apply persisted tempo to the beat source (call while playing after tempo changes). */
	refreshBeatTempo(): void {
		this.beatSourcePort.setTempo(this.gameStatePort.getTempo());
	}

	setHideDiagram(hideDiagram: boolean): void {
		this.gameStatePort.setHideDiagram(hideDiagram);
	}

	private onBeat(): void {
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
		const currentInstance = this.chordsState.currentInstance;
		if (!currentInstance) return;

		const chordBeats = getInstanceBeats(currentInstance);
		this.gameStatePort.updateBeat(this.beatInChord, chordBeats);

		if (this.beatInChord >= chordBeats) {
			this.finalizeChord();
			this.advanceToNextChord();
		}
	}

	private initFirstChord(): void {
		this.progressionRandomMode = this.gameStatePort.getState().randomMode;
		this.seedProgressionForMode(this.progressionRandomMode);

		this.beatInChord = 0;
		this.startTimer();
		const currentInstance = this.chordsState.currentInstance;
		if (currentInstance) {
			this.gameStatePort.updateBeat(0, getInstanceBeats(currentInstance));
		}
	}

	private finalizeChord(): void {
		if (!this.chordDetectedThisWindow) return;

		const currentInstance = this.chordsState.currentInstance;
		if (!currentInstance) return;

		const calibrationOffset = this.gameStatePort.getCalibrationOffsetMs();
		const effectiveElapsed = Math.max(0, this.chordDetectionElapsed - calibrationOffset);
		const ratio = Math.max(0, 1 - effectiveElapsed / CHORD_WINDOW_DURATION_MS);
		const points = Math.round(ratio * 10);
		this.gameStatePort.incrementScore(points);
	}

	private advanceToNextChord(): void {
		this.beatInChord = 0;
		this.chordDetectedThisWindow = false;
		this.chordDetectionElapsed = 0;

		const desiredRandom = this.gameStatePort.getState().randomMode;
		if (desiredRandom !== this.progressionRandomMode) {
			this.progressionRandomMode = desiredRandom;
			this.seedProgressionForMode(this.progressionRandomMode);
			this.startTimer();
			const currentInstance = this.chordsState.currentInstance;
			if (currentInstance) {
				this.gameStatePort.updateBeat(0, getInstanceBeats(currentInstance));
			}
			return;
		}

		if (this.progressionRandomMode) {
			this.advanceRandomMode();
		} else {
			this.advanceSequentialMode();
		}

		this.startTimer();
		const currentInstance = this.chordsState.currentInstance;
		if (currentInstance) {
			this.gameStatePort.updateBeat(0, getInstanceBeats(currentInstance));
		}
	}

	/**
	 * (Re)initializes bar indices and UI for the active random/sequential mode.
	 * Used at session start and when applying a deferred mode switch at a chord boundary.
	 */
	private seedProgressionForMode(isRandom: boolean): void {
		if (this.chordsState.instances.length === 0) return;

		if (isRandom) {
			this.randomCurrentBar = generateRandomBar(this.chordsState.instances);
			this.randomNextBar = generateRandomBar(this.chordsState.instances);
			this.currentChordIndexInBar = 0;

			this.rhythmDisplayPort.setCurrentBar(this.randomCurrentBar);
			this.rhythmDisplayPort.setNextBar(this.randomNextBar);

			const firstBarChord = this.randomCurrentBar.chords[0];
			const firstInstance = firstBarChord.instanceRef;
			if (firstInstance.id) {
				this.chordsStatePort.setCurrentChord(firstInstance.id);
				this.rhythmDisplayPort.setActiveChord(firstBarChord.id);
			}
		} else {
			this.bars = groupIntoBars(this.chordsState.instances);
			this.currentBarIndex = 0;
			this.currentChordIndexInBar = 0;

			const currentBar = this.bars[0];
			const nextBar = this.bars.length > 1 ? this.bars[1] : this.bars[0];

			this.rhythmDisplayPort.setCurrentBar(currentBar);
			this.rhythmDisplayPort.setNextBar(nextBar);

			const firstInstance = this.chordsState.instances[0];
			if (firstInstance?.id) {
				this.chordsStatePort.setCurrentChord(firstInstance.id);
				this.rhythmDisplayPort.setActiveChord(currentBar?.chords[0]?.id ?? null);
			}
		}
	}

	private advanceSequentialMode(): void {
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
		const sourceInstance = activeBarChord.instanceRef;

		if (sourceInstance.id) {
			this.chordsStatePort.setCurrentChord(sourceInstance.id);
		}
		this.rhythmDisplayPort.setActiveChord(activeBarChord.id);
	}

	private advanceRandomMode(): void {
		if (!this.randomCurrentBar) return;

		this.currentChordIndexInBar++;

		if (this.currentChordIndexInBar >= this.randomCurrentBar.chords.length) {
			this.randomCurrentBar = this.randomNextBar;
			this.randomNextBar = generateRandomBar(this.chordsState.instances);
			this.currentChordIndexInBar = 0;

			this.rhythmDisplayPort.setCurrentBar(this.randomCurrentBar!);
			this.rhythmDisplayPort.setNextBar(this.randomNextBar);
		}

		const activeBarChord = this.randomCurrentBar!.chords[this.currentChordIndexInBar];
		const sourceInstance = activeBarChord.instanceRef;

		if (sourceInstance.id) {
			this.chordsStatePort.setCurrentChord(sourceInstance.id);
		}
		this.rhythmDisplayPort.setActiveChord(activeBarChord.id);
	}

	private onDetectedHPCP(detectedHPCP: number[], audioTimestampMs: number): void {
		if (
			this.expectedHPCP.length === 0 ||
			this.countoffRemaining > 0 ||
			!this.hasStartedFirstChord
		)
			return;
		if (this.chordDetectedThisWindow) return;

		const result = compareHPCP(this.expectedHPCP, detectedHPCP);

		if (result.isSimilar) {
			this.chordDetectedThisWindow = true;
			this.chordDetectionElapsed = Math.max(0, audioTimestampMs - this.chordWindowStartMs);
		}
	}

	private startTimer(): void {
		this.clearTimer();
		this.gameStatePort.updateTimer(0);
		this.chordWindowStartMs = performance.now();

		this.timerIntervalId = setInterval(() => {
			const current = this.gameStatePort.getState().timer;
			this.gameStatePort.updateTimer(current + TIMER_INTERVAL_MS);
		}, TIMER_INTERVAL_MS);
	}

	private clearTimer(): void {
		if (this.timerIntervalId) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
	}

	private clearSessionTimeout(): void {
		if (this.sessionTimeoutId) {
			clearTimeout(this.sessionTimeoutId);
			this.sessionTimeoutId = null;
		}
	}
}
