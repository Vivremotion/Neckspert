import { COMB_HARMONICS } from './constants';

/**
 * One way of judging: a timbre profile (amplitudes of harmonics 1..n relative to the
 * fundamental), a threshold and a margin. Several run side by side; one decides.
 */
export interface JudgeVariant {
	id: string;
	profile: readonly number[];
	threshold: number;
	margin: number;
}

/** Harmonics in 1/h, the spike's starting point. To calibrate. */
export const DEFAULT_VARIANT: JudgeVariant = {
	id: 'default',
	profile: Array.from({ length: COMB_HARMONICS }, (_, i) => 1 / (i + 1)),
	threshold: 0.25,
	margin: 0.01
};
