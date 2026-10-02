import { CONFIRM_CENTS } from './config';

export interface PitchReading {
	frequencyHz: number;
	clarity: number;
}

/**
 * Accepts a note when the attack window clears its own clarity floor, the
 * sustained window clears the stricter floor, and the two pitches agree.
 */
export function confirmedPitch(
	attack: PitchReading,
	sustain: PitchReading,
	gate: { attackClarityThreshold: number; sustainClarityThreshold: number }
): PitchReading | null {
	if (!(attack.frequencyHz > 0) || attack.clarity < gate.attackClarityThreshold) return null;
	if (!(sustain.frequencyHz > 0) || sustain.clarity < gate.sustainClarityThreshold) return null;
	const cents = Math.abs(1200 * Math.log2(attack.frequencyHz / sustain.frequencyHz));
	if (cents > CONFIRM_CENTS) return null;
	return {
		frequencyHz: (attack.frequencyHz + sustain.frequencyHz) / 2,
		clarity: Math.min(attack.clarity, sustain.clarity)
	};
}
