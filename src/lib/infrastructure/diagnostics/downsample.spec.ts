import { describe, expect, it } from 'vitest';
import { createDownsampler, DIAGNOSTIC_SAMPLE_RATE } from './downsample';

function sine(hz: number, rate: number, seconds: number, amplitude = 0.5): Float32Array {
	const out = new Float32Array(Math.round(rate * seconds));
	for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
	return out;
}

/** Peak amplitude after the filter has settled (the first 10 ms left out). */
function steadyAmplitude(samples: Float32Array, rate: number): number {
	let rms = 0;
	const from = Math.round(rate * 0.01);
	for (let i = from; i < samples.length; i++) rms += samples[i] * samples[i];
	return Math.sqrt(rms / (samples.length - from)) * Math.SQRT2;
}

function inFrames(
	downsample: (s: Float32Array) => Float32Array,
	signal: Float32Array,
	size: number
) {
	const parts: Float32Array[] = [];
	for (let i = 0; i < signal.length; i += size)
		parts.push(downsample(signal.subarray(i, i + size)));
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

describe('createDownsampler', () => {
	it('targets 16 kHz by default', () => {
		expect(DIAGNOSTIC_SAMPLE_RATE).toBe(16000);
	});

	for (const rate of [48000, 44100]) {
		describe(`from ${rate} Hz`, () => {
			it('keeps the amplitude of a 1 kHz sine within 5 %', () => {
				const out = createDownsampler(rate).push(sine(1000, rate, 1));
				expect(steadyAmplitude(out, DIAGNOSTIC_SAMPLE_RATE)).toBeGreaterThan(0.5 * 0.95);
				expect(steadyAmplitude(out, DIAGNOSTIC_SAMPLE_RATE)).toBeLessThan(0.5 * 1.05);
			});

			it('attenuates a 9 kHz sine by at least 40 dB', () => {
				const out = createDownsampler(rate).push(sine(9000, rate, 1));
				const db = 20 * Math.log10(steadyAmplitude(out, DIAGNOSTIC_SAMPLE_RATE) / 0.5);
				expect(db).toBeLessThan(-40);
			});

			it('gives the same signal pushed in 512-sample frames as in one block', () => {
				const signal = sine(1000, rate, 0.5);
				for (let i = 0; i < signal.length; i++) signal[i] += 0.2 * Math.sin(i * 0.37);
				const whole = createDownsampler(rate).push(signal);
				const framed = createDownsampler(rate);
				const chunked = inFrames((s) => framed.push(s), signal, 512);
				expect(chunked.length).toBe(whole.length);
				let worst = 0;
				for (let i = 0; i < whole.length; i++)
					worst = Math.max(worst, Math.abs(whole[i] - chunked[i]));
				expect(worst).toBeLessThan(1e-6);
			});

			it('follows the rate ratio in length', () => {
				const out = createDownsampler(rate).push(new Float32Array(rate));
				expect(Math.abs(out.length - DIAGNOSTIC_SAMPLE_RATE)).toBeLessThanOrEqual(1);
			});
		});
	}

	it('starts again from silence after a reset', () => {
		const downsampler = createDownsampler(48000);
		const signal = sine(1000, 48000, 0.1);
		const first = downsampler.push(signal);
		downsampler.push(sine(3000, 48000, 0.05));
		downsampler.reset();
		const again = downsampler.push(signal);
		expect(Array.from(again)).toEqual(Array.from(first));
	});

	it('says how late its filter makes the sound', () => {
		expect(createDownsampler(48000).delayS).toBeCloseTo(47 / 48000, 9);
	});
});
