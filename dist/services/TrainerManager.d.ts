import type { ChordsStatePort } from '../application/ports/ChordsStatePort';
import type { GameStatePort } from '../application/ports/GameStatePort';
import type { RhythmDisplayPort } from '../application/ports/RhythmDisplayPort';
import type { BeatSourcePort } from '../application/ports/BeatSourcePort';
import type { ChordDetectionPort } from '../application/ports/ChordDetectionPort';
export interface TrainerManagerPorts {
    chordsState: ChordsStatePort;
    gameState: GameStatePort;
    rhythmDisplay: RhythmDisplayPort;
    beatSource: BeatSourcePort;
    chordDetection: ChordDetectionPort;
}
/**
 * Application service: orchestrates a chord practice session (count-off, beats,
 * chord progression, detection scoring). Depends on ports only (hexagonal).
 */
export declare class TrainerManager {
    private readonly chordsStatePort;
    private readonly gameStatePort;
    private readonly rhythmDisplayPort;
    private readonly beatSourcePort;
    private readonly chordDetectionPort;
    private chordsState;
    private expectedHPCP;
    private beatInChord;
    private hasStartedFirstChord;
    private chordDetectedThisWindow;
    private chordDetectionElapsed;
    private chordWindowStartMs;
    private countoffRemaining;
    private timerIntervalId;
    private sessionTimeoutId;
    private bars;
    private currentBarIndex;
    private currentChordIndexInBar;
    private randomNextBar;
    private randomCurrentBar;
    /** Mode used for bar/chord advancement; may lag `gameState.randomMode` until the next chord boundary. */
    private progressionRandomMode;
    constructor(ports: TrainerManagerPorts);
    start(): Promise<void>;
    pause(): void;
    setRandomMode(randomMode: boolean): void;
    /** Apply persisted tempo to the beat source (call while playing after tempo changes). */
    refreshBeatTempo(): void;
    setHideDiagram(hideDiagram: boolean): void;
    private onBeat;
    private initFirstChord;
    private finalizeChord;
    private advanceToNextChord;
    /**
     * (Re)initializes bar indices and UI for the active random/sequential mode.
     * Used at session start and when applying a deferred mode switch at a chord boundary.
     */
    private seedProgressionForMode;
    private advanceSequentialMode;
    private advanceRandomMode;
    private onDetectedHPCP;
    private startTimer;
    private clearTimer;
    private clearSessionTimeout;
}
