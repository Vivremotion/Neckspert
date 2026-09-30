import type { Verdict } from '$lib/domain/types';

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** One oscillator of a cue. Times in seconds from the cue time; gain is linear. */
export interface ToneSpec {
	waveform: Waveform;
	offset: number;
	duration: number;
	startHz: number;
	/** Equal to startHz for a steady tone; otherwise an exponential glide. */
	endHz: number;
	peakGain: number;
}

/** A cue must end before the next beat can matter and never mask the guitar. To calibrate. */
export const MAX_CUE_DURATION_S = 0.15;
/** Below the metronome clicks (0.7 to 0.9). To calibrate. */
export const MAX_CUE_GAIN = 0.2;
export const CUE_ATTACK_S = 0.005;
/** Exponential ramps cannot reach 0. */
export const CUE_SILENCE = 0.0001;

const C6_HZ = 1046.5;
const E6_HZ = 1318.51;

/** One reserved sound per verdict, recognizable without looking. */
export const CUE_SPECS: Readonly<Record<Verdict, readonly ToneSpec[]>> = {
	perfect: [
		{
			waveform: 'triangle',
			offset: 0,
			duration: 0.06,
			startHz: C6_HZ,
			endHz: C6_HZ,
			peakGain: 0.16
		},
		{
			waveform: 'triangle',
			offset: 0.05,
			duration: 0.07,
			startHz: E6_HZ,
			endHz: E6_HZ,
			peakGain: 0.16
		}
	],
	early: [
		{ waveform: 'triangle', offset: 0, duration: 0.09, startHz: 660, endHz: 990, peakGain: 0.14 }
	],
	late: [
		{ waveform: 'triangle', offset: 0, duration: 0.09, startHz: 990, endHz: 660, peakGain: 0.14 }
	],
	wrong: [
		{ waveform: 'square', offset: 0, duration: 0.14, startHz: 110, endHz: 98, peakGain: 0.05 }
	]
};

export function cueDuration(tones: readonly ToneSpec[]): number {
	return Math.max(...tones.map((tone) => tone.offset + tone.duration));
}
