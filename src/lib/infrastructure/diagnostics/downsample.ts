/** Rate of the sound kept by the diagnostic journal: enough for a guitar's partials up to 7 kHz. */
export const DIAGNOSTIC_SAMPLE_RATE = 16000;

/** Length of the anti-aliasing filter (odd: linear phase, a whole-sample delay). */
export const DOWNSAMPLE_TAPS = 95;

/** Cutoff of the anti-aliasing filter, as a share of the target rate (7.2 kHz at 16 kHz). */
export const DOWNSAMPLE_CUTOFF_RATIO = 0.45;

/** Streaming low-pass then resampling; keeps its filter state between calls. */
export interface Downsampler {
	push(samples: Float32Array): Float32Array;
	/** Forgets the past: the next sample starts a new signal, preceded by silence. */
	reset(): void;
	/** Group delay of the filter (s): an output sample sounded this long before its position. */
	readonly delayS: number;
}

/** Windowed-sinc (Blackman) low-pass, unit gain at 0 Hz. */
function lowPass(taps: number, cutoff: number): Float64Array {
	const h = new Float64Array(taps);
	const middle = (taps - 1) / 2;
	let sum = 0;
	for (let n = 0; n < taps; n++) {
		const x = n - middle;
		const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
		const phase = (2 * Math.PI * n) / (taps - 1);
		const blackman = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
		h[n] = sinc * blackman;
		sum += h[n];
	}
	for (let n = 0; n < taps; n++) h[n] /= sum;
	return h;
}

/**
 * Low-pass at 0.45 × the target rate, then one filtered sample in `fromRate / toRate` when the
 * ratio is whole (48 kHz), else linear interpolation on the filtered signal (44.1 kHz). Output
 * positions are counted from the last reset, so the result does not depend on how the input
 * was cut into frames.
 */
export function createDownsampler(
	fromRate: number,
	toRate: number = DIAGNOSTIC_SAMPLE_RATE
): Downsampler {
	const taps = DOWNSAMPLE_TAPS;
	const h = lowPass(taps, (DOWNSAMPLE_CUTOFF_RATIO * toRate) / fromRate);
	const ratio = fromRate / toRate;
	const whole = Number.isInteger(ratio) ? ratio : 0;
	/** The last taps − 1 input samples, oldest first. */
	let history = new Float64Array(taps - 1);
	/** Index, since the reset, of the next input sample. */
	let consumed = 0;
	/** Index of the next output sample, and the filtered sample before the current one. */
	let produced = 0;
	let previous = 0;

	function filtered(buffer: Float64Array, end: number): number {
		// Causal: the newest sample (buffer[end]) meets h[0].
		let y = 0;
		for (let k = 0; k < taps; k++) y += h[k] * buffer[end - k];
		return y;
	}

	return {
		delayS: (taps - 1) / 2 / fromRate,

		push(samples: Float32Array): Float32Array {
			const keep = taps - 1;
			const buffer = new Float64Array(keep + samples.length);
			buffer.set(history);
			buffer.set(samples, keep);
			const out: number[] = [];
			for (let i = 0; i < samples.length; i++) {
				const n = consumed + i;
				if (whole) {
					if (n % whole === 0) out.push(filtered(buffer, keep + i));
					continue;
				}
				const y = filtered(buffer, keep + i);
				// Outputs whose position falls in [n − 1, n): between the previous filtered sample and this one.
				for (;;) {
					const position = (produced * fromRate) / toRate;
					if (position >= n) break;
					const frac = position - (n - 1);
					out.push(previous * (1 - frac) + y * frac);
					produced++;
				}
				previous = y;
			}
			consumed += samples.length;
			history = buffer.slice(buffer.length - keep);
			return Float32Array.from(out);
		},

		reset(): void {
			history = new Float64Array(taps - 1);
			consumed = 0;
			produced = 0;
			previous = 0;
		}
	};
}
