import { COMB_INHARMONICITY, COMB_MAX_HZ, COMB_WIDTH_BINS } from './constants';

export function midiToHz(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * A note's expected magnitude spectrum, `bins` long: Gaussian partials at the inharmonic
 * frequencies of harmonics 1..profile.length, each at the profile's amplitude, up to COMB_MAX_HZ.
 */
export function noteComb(
	midi: number,
	bins: number,
	sampleRate: number,
	profile: readonly number[]
): Float64Array {
	const binHz = sampleRate / (2 * bins);
	const comb = new Float64Array(bins);
	const f0 = midiToHz(midi);
	const reach = Math.ceil(COMB_WIDTH_BINS * 3);
	for (let h = 1; h <= profile.length; h++) {
		const f = h * f0 * Math.sqrt(1 + COMB_INHARMONICITY * h * h);
		if (f > COMB_MAX_HZ) break;
		const center = f / binHz;
		for (let k = Math.floor(center) - reach; k <= Math.ceil(center) + reach; k++) {
			if (k < 0 || k >= bins) continue;
			const d = (k - center) / COMB_WIDTH_BINS;
			comb[k] += profile[h - 1] * Math.exp(-0.5 * d * d);
		}
	}
	return comb;
}
