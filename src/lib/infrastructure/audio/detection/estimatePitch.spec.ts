import { describe, expect, it } from 'vitest';
import { estimatePitch } from './estimatePitch';

function sine(frequencyHz: number, sampleRate: number, length: number): Float32Array {
	const samples = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
	}
	return samples;
}

describe('estimatePitch', () => {
	it('detects A4 on a clean sine at 48 kHz', () => {
		const result = estimatePitch(sine(440, 48000, 2048), 48000, 0.8);
		expect(result).not.toBeNull();
		expect(result!.frequencyHz).toBeCloseTo(440, 0);
		expect(result!.clarity).toBeGreaterThanOrEqual(0.8);
	});

	it('detects low E without an octave error at 48 kHz', () => {
		const result = estimatePitch(sine(82.40689, 48000, 2048), 48000, 0.8);
		expect(result).not.toBeNull();
		expect(result!.frequencyHz).toBeCloseTo(82.4, 0);
	});

	it('returns null for silence', () => {
		expect(estimatePitch(new Float32Array(2048), 48000, 0.8)).toBeNull();
	});

	it('returns null when clarity is below the threshold', () => {
		const noise = new Float32Array(2048);
		for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
		expect(estimatePitch(noise, 48000, 0.99)).toBeNull();
	});
});
