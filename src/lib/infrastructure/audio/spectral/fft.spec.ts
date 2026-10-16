import { describe, expect, it, vi } from 'vitest';
import { fftSizeFor } from '../chords/constants';
import { magnitudeSpectrum, magnitudeSpectrumInto } from './fft';
import { binHz, hannWindow } from '../chords/spectrum';

describe('fftSizeFor', () => {
	it('is the power of two nearest to the target window', () => {
		expect(fftSizeFor(48000)).toBe(8192);
		expect(fftSizeFor(44100)).toBe(8192);
	});
});

describe('magnitudeSpectrum', () => {
	it('puts a windowed sine at its frequency bin', () => {
		const n = 8192;
		const rate = 48000;
		const window = hannWindow(n);
		const frame = new Float64Array(n);
		for (let i = 0; i < n; i++) frame[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * window[i];
		const spectrum = magnitudeSpectrum(frame);
		expect(spectrum).toHaveLength(n / 2);
		const peak = spectrum.indexOf(Math.max(...spectrum));
		expect(peak).toBe(Math.round(440 / binHz(rate, n)));
	});
});

function sine(n: number, hz: number, rate: number): Float64Array {
	const frame = new Float64Array(n);
	for (let i = 0; i < n; i++) frame[i] = Math.sin((2 * Math.PI * hz * i) / rate);
	return frame;
}

function noise(n: number, seed: number): Float64Array {
	let state = seed;
	const frame = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		state = (state * 1664525 + 1013904223) >>> 0;
		frame[i] = state / 2 ** 31 - 1;
	}
	return frame;
}

describe('magnitudeSpectrum across sizes', () => {
	it('reads each size correctly when sizes alternate, building each plan once', () => {
		const rate = 48000;
		const big = sine(8192, 440, rate);
		const small = sine(2048, 1000, rate);
		const peakOf = (spectrum: Float64Array) => spectrum.indexOf(Math.max(...spectrum));
		// Warm both sizes, then count the trigonometry a call computes: a plan is built with it.
		magnitudeSpectrum(big);
		magnitudeSpectrum(small);
		const cos = vi.spyOn(Math, 'cos');
		try {
			for (let round = 0; round < 3; round++) {
				expect(peakOf(magnitudeSpectrum(big))).toBe(Math.round((440 * 8192) / rate));
				expect(peakOf(magnitudeSpectrum(small))).toBe(Math.round((1000 * 2048) / rate));
			}
			expect(cos).not.toHaveBeenCalled();
		} finally {
			cos.mockRestore();
		}
	});

	it('refuses a size that is not a power of 2', () => {
		expect(() => magnitudeSpectrum(new Float64Array(1000))).toThrow(RangeError);
	});
});

describe('magnitudeSpectrumInto', () => {
	it.each([2048, 8192])('equals magnitudeSpectrum on random input at %i points', (n) => {
		const frame = noise(n, n);
		const out = new Float64Array(n / 2);
		magnitudeSpectrumInto(frame, out, { re: new Float64Array(n), im: new Float64Array(n) });
		expect(Array.from(out)).toEqual(Array.from(magnitudeSpectrum(frame)));
	});

	it('gives the same result when its scratch still holds an earlier analysis', () => {
		const n = 2048;
		const scratch = { re: new Float64Array(n), im: new Float64Array(n) };
		const out = new Float64Array(n / 2);
		magnitudeSpectrumInto(noise(n, 1), out, scratch);
		const frame = noise(n, 2);
		magnitudeSpectrumInto(frame, out, scratch);
		expect(Array.from(out)).toEqual(Array.from(magnitudeSpectrum(frame)));
	});
});
