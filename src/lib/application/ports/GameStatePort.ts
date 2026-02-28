/**
 * Snapshot of game session state (read model for the trainer).
 */
export interface GameStateSnapshot {
	readonly randomMode: boolean;
	readonly timer: number;
}

/**
 * Driven port: game session state and commands (score, countdown, beat, playing).
 */
export interface GameStatePort {
	getState(): GameStateSnapshot;
	getTempo(): number;
	/** Calibration offset in ms (positive = app perceives hit late). 0 if not calibrated. */
	getCalibrationOffsetMs(): number;
	reset(): void;
	setPlaying(playing: boolean): void;
	updateCountdown(countdown: number): void;
	updateTimer(timer: number): void;
	incrementScore(points: number): void;
	updateBeat(currentBeat: number, totalBeatsInChord: number): void;
	setRandomMode(randomMode: boolean): void;
	setHideDiagram(hideDiagram: boolean): void;
}
