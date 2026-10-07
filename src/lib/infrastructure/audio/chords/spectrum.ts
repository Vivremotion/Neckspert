/** Symmetric Hann window of length n. */
export function hannWindow(n: number): Float64Array {
	const window = new Float64Array(n);
	for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
	return window;
}

/** Keeps each bin's peak: a note counts once it has sounded, even late in the window. */
export function maxPool(into: Float64Array, spectrum: Float64Array): void {
	for (let k = 0; k < into.length; k++) if (spectrum[k] > into[k]) into[k] = spectrum[k];
}

/** Width of one bin of an FFT of `fftSize` points. */
export function binHz(sampleRate: number, fftSize: number): number {
	return sampleRate / fftSize;
}
