interface FftPlan {
	n: number;
	cos: Float64Array;
	sin: Float64Array;
	reversed: Uint32Array;
}

let lastPlan: FftPlan | null = null;

function planFor(n: number): FftPlan {
	if (lastPlan?.n === n) return lastPlan;
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
	lastPlan = { n, cos, sin, reversed };
	return lastPlan;
}

/** Magnitude spectrum (n/2 bins) of a real frame whose length n is a power of 2. */
export function magnitudeSpectrum(frame: Float64Array): Float64Array {
	const n = frame.length;
	const { cos, sin, reversed } = planFor(n);
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let i = 0; i < n; i++) re[reversed[i]] = frame[i];
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
	const out = new Float64Array(n / 2);
	for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
	return out;
}
