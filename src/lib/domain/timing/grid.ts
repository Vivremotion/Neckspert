import { DEFAULT_RESPIRATION_BARS } from '../exercise/pacing';

/** The metronome runs in 4/4 and accents beat 1. */
export const BEATS_PER_BAR = 4 as const;

/**
 * Smallest prompt beat ≥ `earliest` whose target (`prompt + lead`) lands on the first beat of
 * a bar. At 8 and 4 beats the prompt falls on beat 1, at 2 beats on beat 3: never on 2 or 4.
 */
export function alignedPromptBeat(earliest: number, lead: number): number {
	const misalignment = (((earliest + lead) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
	return misalignment === 0 ? earliest : earliest + BEATS_PER_BAR - misalignment;
}

/** First beat on which the next prompt may appear after a target on `targetBeat`, `bars` later. */
export function respirationStart(
	targetBeat: number,
	bars: number = DEFAULT_RESPIRATION_BARS
): number {
	return targetBeat + BEATS_PER_BAR * bars;
}
