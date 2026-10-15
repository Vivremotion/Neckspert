interface FftPlan {
	n: number;
	cos: Float64Array;
	sin: Float64Array;
	reversed: Uint32Array;
}

/** Plans by size: the chord verifier and the attack tracker alternate sizes in one thread. */
const plans = new Map<number, FftPlan>();

function planFor(n: number): FftPlan {
	const cached = plans.get(n);
	if (cached) return cached;
	if (!Number.isInteger(Math.log2(n))) throw new RangeError(`FFT size must be a power of 2: ${n}`);
	const cos = new Float64Array(n / 2);
	const sin = new Float64Array(n / 2);
	for (let i = 0; i < n / 2; i++) {
		cos[i] = Math.cos((2 * Math.PI * i) / n);
		sin[i] = -Math.sin((2 * Math.PI * i) / n);
	}
	const bits = Math.log2(n);
	const reversed = new Uint32Array(n);
	for (let i = 0; i < n; i++) {
		let r = 0;
		for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
		reversed[i] = r;
	}
	const plan = { n, cos, sin, reversed };
	plans.set(n, plan);
	return plan;
}

/** Working buffers of `magnitudeSpectrumInto`, each as long as the frame. */
export interface FftScratch {
	re: Float64Array;
	im: Float64Array;
}

/**
 * Magnitude spectrum of a real frame whose length n is a power of 2, written into `out` (its
 * first n/2 bins) without allocating. `scratch` holds the working buffers (n points each); what
 * it held before is overwritten.
 */
export function magnitudeSpectrumInto(
	frame: Float64Array,
	out: Float64Array,
	scratch: FftScratch
): void {
	const n = frame.length;
	const { cos, sin, reversed } = planFor(n);
	const { re, im } = scratch;
	for (let i = 0; i < n; i++) re[reversed[i]] = frame[i];
	im.fill(0, 0, n);
	for (let size = 2; size <= n; size *= 2) {
		const half = size / 2;
		const step = n / size;
		for (let start = 0; start < n; start += size) {
			for (let j = 0; j < half; j++) {
				const k = j * step;
				const a = start + j;
				const b = a + half;
				const tr = re[b] * cos[k] - im[b] * sin[k];
				const ti = re[b] * sin[k] + im[b] * cos[k];
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
			}
		}
	}
	for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
}

/** Magnitude spectrum (n/2 bins) of a real frame whose length n is a power of 2. */
export function magnitudeSpectrum(frame: Float64Array): Float64Array {
	const n = frame.length;
	const out = new Float64Array(n / 2);
	magnitudeSpectrumInto(frame, out, { re: new Float64Array(n), im: new Float64Array(n) });
	return out;
}
