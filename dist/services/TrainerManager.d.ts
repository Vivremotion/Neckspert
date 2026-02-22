export declare class TrainerManager {
    private expectedHPCP;
    private chordsState;
    private countdownIntervalId;
    private timerIntervalId;
    /** When the rhythm grid started (after countdown). Used for timing precision. */
    private rhythmStartTime;
    /** Cumulative beats at which each chord starts (for rhythm mode). */
    private chordStartBeats;
    constructor();
    private buildChordStartBeats;
    start(): Promise<void>;
    pause(): void;
    setRandomMode(randomMode: boolean): void;
    setHideDiagram(hideDiagram: boolean): void;
    private onDetectedHPCP;
    private setNextChord;
    private startTimer;
    private compareHPCP;
}
export declare const trainerManager: TrainerManager;
