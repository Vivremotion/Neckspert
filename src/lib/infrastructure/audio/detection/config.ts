/** What reading the pitch of a note needs; its attack comes from the attack sensor. */
export interface PitchConfig {
	minMidi: number;
	maxMidi: number;
	/** Clarity required on the sustained window, after the pick attack. */
	clarityThreshold: number;
	/** Clarity required on the first window, which includes the pick attack. */
	attackClarityThreshold: number;
	windowSize: number;
}

/** Guitar range: low E (MIDI 40) to E6 (MIDI 88). windowSize ≥ 2048 at 48 kHz for E2. */
export const DEFAULT_DETECTOR_CONFIG: PitchConfig = {
	minMidi: 40,
	maxMidi: 88,
	clarityThreshold: 0.85,
	attackClarityThreshold: 0.75,
	windowSize: 2048
};

/** Max cents between two confirming pitch estimates. */
export const CONFIRM_CENTS = 50;
