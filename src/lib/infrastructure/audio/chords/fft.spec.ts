import { describe, expect, it } from 'vitest';
import { fftSizeFor } from './constants';
import { magnitudeSpectrum } from './fft';
import { binHz, hannWindow } from './spectrum';

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
