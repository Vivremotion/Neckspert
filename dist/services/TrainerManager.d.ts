export declare class TrainerManager {
    private expectedHPCP;
    private chordsState;
    private countdownIntervalId;
    private timerIntervalId;
    constructor();
    start(): Promise<void>;
    pause(): void;
    private onDetectedHPCP;
    private setNextChord;
    private startTimer;
    private compareHPCP;
}
export declare const trainerManager: TrainerManager;
