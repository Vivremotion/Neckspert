export interface CalibrationConfig {
	bpm: number;
	hitsNeeded: number;
	maxSpreadMs: number;
	noSoundBeats: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
	bpm: 80,
	hitsNeeded: 10,
	maxSpreadMs: 40,
	noSoundBeats: 32
};

/** Audio seconds after `clock.now()` before beat 0 (must be ≥ 0.1). */
export const CALIBRATION_START_DELAY_S = 0.5;
