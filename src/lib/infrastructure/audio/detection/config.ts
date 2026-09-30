export interface DetectorConfig {
	minMidi: number;
	maxMidi: number;
	clarityThreshold: number;
	onsetRatio: number;
	minRms: number;
	cooldownMs: number;
	windowSize: number;
}

/** Guitar range: low E (MIDI 40) to E6 (MIDI 88). windowSize ≥ 2048 at 48 kHz for E2. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
	minMidi: 40,
	maxMidi: 88,
	clarityThreshold: 0.85,
	onsetRatio: 1.8,
	minRms: 0.02,
	cooldownMs: 100,
	windowSize: 2048
};

/** Max cents between two confirming pitch estimates. */
export const CONFIRM_CENTS = 50;
