/** The metronome runs in 4/4 and accents beat 1. */
export const BEATS_PER_BAR = 4 as const;

/** Bars after the target bar before the next prompt may appear. To calibrate. */
export const RESPIRATION_BARS = 1;

/** Mode 1: the string of a prompt shows this many beats before its note. To calibrate. */
export const STRING_PREVIEW_BEATS = 1;

/**
 * Smallest prompt beat ≥ `earliest` whose target (`prompt + lead`) lands on the first beat of
 * a bar. At 8 and 4 beats the prompt falls on beat 1, at 2 beats on beat 3: never on 2 or 4.
 */
export function alignedPromptBeat(earliest: number, lead: number): number {
	const misalignment = (((earliest + lead) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
	return misalignment === 0 ? earliest : earliest + BEATS_PER_BAR - misalignment;
}

/** First beat on which the next prompt may appear after a target on `targetBeat`. */
export function respirationStart(targetBeat: number): number {
	return targetBeat + BEATS_PER_BAR * RESPIRATION_BARS;
}
