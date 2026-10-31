export interface DetectorConfig {
	minMidi: number;
	maxMidi: number;
	/** Clarity required on the sustained window, after the pick attack. */
	clarityThreshold: number;
	/** Clarity required on the first window, which includes the pick attack. */
	attackClarityThreshold: number;
	onsetRatio: number;
	minRms: number;
	cooldownMs: number;
	windowSize: number;
}

/** What reading the pitch of a note needs; the rest is the chord verifier's onset detector. */
export type PitchConfig = Pick<
	DetectorConfig,
	'minMidi' | 'maxMidi' | 'clarityThreshold' | 'attackClarityThreshold' | 'windowSize'
>;

/** Guitar range: low E (MIDI 40) to E6 (MIDI 88). windowSize ≥ 2048 at 48 kHz for E2. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
	minMidi: 40,
	maxMidi: 88,
	clarityThreshold: 0.85,
	attackClarityThreshold: 0.75,
	onsetRatio: 1.8,
	minRms: 0.02,
	cooldownMs: 100,
	windowSize: 2048
};

/** Max cents between two confirming pitch estimates. */
export const CONFIRM_CENTS = 50;
