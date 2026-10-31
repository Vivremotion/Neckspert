import { CONFIRM_CENTS } from './config';

export interface PitchReading {
	frequencyHz: number;
	clarity: number;
}

const OCTAVE_CENTS = 1200;

/**
 * Accepts a note when the attack window clears its own clarity floor, the
 * sustained window clears the stricter floor, and the two pitches agree. The note before, still
 * ringing on another string, can make the attack window read an octave below the note: the sustained
 * window, past the attack, tells it. An octave the other way is not explained, and stays refused.
 */
export function confirmedPitch(
	attack: PitchReading,
	sustain: PitchReading,
	gate: { attackClarityThreshold: number; sustainClarityThreshold: number }
): PitchReading | null {
	if (!(attack.frequencyHz > 0) || attack.clarity < gate.attackClarityThreshold) return null;
	if (!(sustain.frequencyHz > 0) || sustain.clarity < gate.sustainClarityThreshold) return null;
	const cents = 1200 * Math.log2(attack.frequencyHz / sustain.frequencyHz);
	if (Math.abs(cents + OCTAVE_CENTS) <= CONFIRM_CENTS) {
		return { frequencyHz: sustain.frequencyHz, clarity: attack.clarity };
	}
	if (Math.abs(cents) > CONFIRM_CENTS) return null;
	return {
		frequencyHz: (attack.frequencyHz + sustain.frequencyHz) / 2,
		clarity: Math.min(attack.clarity, sustain.clarity)
	};
}
