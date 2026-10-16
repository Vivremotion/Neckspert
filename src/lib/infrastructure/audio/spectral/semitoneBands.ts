export const DEFAULT_FROM_HZ = 30;
export const DEFAULT_TO_HZ = 16000;
export const DEFAULT_BANDS_PER_OCTAVE = 24;

export interface SemitoneFilterbankInput {
	sampleRate: number;
	/** Length of the frame the magnitudes come from (the spectrum has fftSize / 2 bins). */
	fftSize: number;
	/** Centre of the first band. */
	fromHz?: number;
	/** The last band is centred at or below this, never above Nyquist. */
	toHz?: number;
	bandsPerOctave?: number;
}

export interface SemitoneFilterbank {
	readonly bands: number;
	readonly centersHz: Float64Array;
	/** Writes log10(1 + sum(filter * magnitude)) of each band into `out` (length `bands`). */
	apply(magnitudes: Float64Array, out: Float64Array): void;
}

/**
 * Triangular filters over the bins of a magnitude spectrum, centres a fraction of an octave apart
 * (a quarter tone by default). Each filter sums to 1. A band whose triangle holds no whole bin
 * takes the nearest bin alone.
 */
export function createSemitoneFilterbank(input: SemitoneFilterbankInput): SemitoneFilterbank {
	const { sampleRate, fftSize } = input;
	const fromHz = input.fromHz ?? DEFAULT_FROM_HZ;
	const toHz = Math.min(input.toHz ?? DEFAULT_TO_HZ, sampleRate / 2);
	const bandsPerOctave = input.bandsPerOctave ?? DEFAULT_BANDS_PER_OCTAVE;
	const binCount = fftSize / 2;
	const binHz = sampleRate / fftSize;
	const ratio = 2 ** (1 / bandsPerOctave);

	const centers: number[] = [];
	for (let hz = fromHz; hz <= toHz * (1 + 1e-9); hz *= ratio) centers.push(hz);
	const bands = centers.length;
	const centersHz = Float64Array.from(centers);

	const firstBin = new Uint32Array(bands);
	const weights: Float64Array[] = [];
	for (let k = 0; k < bands; k++) {
		const centre = centers[k] / binHz;
		const lower = centre / ratio;
		const upper = centre * ratio;
		const first = Math.max(0, Math.ceil(lower));
		const last = Math.min(binCount - 1, Math.floor(upper));
		const w: number[] = [];
		let start = first;
		for (let bin = first; bin <= last; bin++) {
			const weight =
				bin <= centre ? (bin - lower) / (centre - lower) : (upper - bin) / (upper - centre);
			w.push(Math.max(0, weight));
		}
		let sum = w.reduce((a, b) => a + b, 0);
		if (sum <= 0) {
			start = Math.min(binCount - 1, Math.max(0, Math.round(centre)));
			w.length = 0;
			w.push(1);
			sum = 1;
		}
		firstBin[k] = start;
		weights.push(Float64Array.from(w, (x) => x / sum));
	}

	return {
		bands,
		centersHz,
		apply(magnitudes, out) {
			for (let k = 0; k < bands; k++) {
				const w = weights[k];
				const start = firstBin[k];
				let acc = 0;
				for (let j = 0; j < w.length; j++) acc += w[j] * magnitudes[start + j];
				out[k] = Math.log10(1 + acc);
			}
		}
	};
}
