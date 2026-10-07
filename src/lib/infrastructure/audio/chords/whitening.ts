import { WHITENING_NU } from './constants';

/** Number of ~ERB band centres tried (Klapuri 2006). */
const BANDS = 32;

/**
 * Klapuri's spectral whitening gains: bandwise σ^(ν−1) on ~ERB bands, interpolated per bin, so
 * loud low strings do not drown the partials of quieter notes.
 */
export function whiteningGains(
	magnitude: Float64Array,
	sampleRate: number,
	nu: number = WHITENING_NU
): Float64Array {
	const n = magnitude.length;
	const binHz = sampleRate / (2 * n);
	const centers: number[] = [];
	for (let b = 0; b < BANDS; b++) {
		const center = 229 * (10 ** ((b + 1) / 21.4) - 1);
		if (center > sampleRate / 2) break;
		centers.push(center);
	}
	const gamma: number[] = [];
	for (let b = 1; b < centers.length - 1; b++) {
		const lo = centers[b - 1];
		const mid = centers[b];
		const hi = centers[b + 1];
		let sum = 0;
		let weight = 0;
		for (let k = Math.floor(lo / binHz); k <= Math.ceil(hi / binHz) && k < n; k++) {
			const f = k * binHz;
			const h = f < mid ? (f - lo) / (mid - lo) : (hi - f) / (hi - mid);
			if (h <= 0) continue;
			sum += h * magnitude[k] * magnitude[k];
			weight += h;
		}
		const sigma = Math.sqrt(sum / Math.max(1e-12, weight)) + 1e-9;
		gamma.push(sigma ** (nu - 1));
	}
	const inner = centers.slice(1, -1);
	const gains = new Float64Array(n);
	let b = 0;
	for (let k = 0; k < n; k++) {
		const f = k * binHz;
		if (f <= inner[0]) gains[k] = gamma[0];
		else if (f >= inner[inner.length - 1]) gains[k] = gamma[gamma.length - 1];
		else {
			while (inner[b + 1] < f) b++;
			const t = (f - inner[b]) / (inner[b + 1] - inner[b]);
			gains[k] = gamma[b] * (1 - t) + gamma[b + 1] * t;
		}
	}
	return gains;
}
