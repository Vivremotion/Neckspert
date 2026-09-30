import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { OnsetDetector } from './OnsetDetector';

const SAMPLE_RATE = 48000;
const FRAME = 512;

function frameOf(rms: number): Float32Array {
	const samples = new Float32Array(FRAME);
	const amplitude = rms * Math.SQRT2;
	for (let i = 0; i < FRAME; i++) samples[i] = amplitude;
	return samples;
}

function silence(): Float32Array {
	return new Float32Array(FRAME);
}

describe('OnsetDetector', () => {
	it('returns null while the signal stays quiet', () => {
		const detector = new OnsetDetector(DEFAULT_DETECTOR_CONFIG, SAMPLE_RATE);
		for (let i = 0; i < 20; i++) {
			expect(detector.push(silence(), i * (FRAME / SAMPLE_RATE))).toBeNull();
		}
	});

	it('fires on a sharp RMS rise and respects the cooldown', () => {
		const detector = new OnsetDetector(DEFAULT_DETECTOR_CONFIG, SAMPLE_RATE);
		for (let i = 0; i < 30; i++) {
			detector.push(frameOf(0.005), i * (FRAME / SAMPLE_RATE));
		}
		const attackAt = 30 * (FRAME / SAMPLE_RATE);
		const onset = detector.push(frameOf(0.2), attackAt);
		expect(onset).not.toBeNull();
		expect(Math.abs(onset! - attackAt)).toBeLessThan(0.01);

		const next = detector.push(frameOf(0.25), attackAt + FRAME / SAMPLE_RATE);
		expect(next).toBeNull();
	});

	it('does not fire on a slow level creep', () => {
		const detector = new OnsetDetector(
			{ ...DEFAULT_DETECTOR_CONFIG, onsetRatio: 1.8, minRms: 0.02 },
			SAMPLE_RATE
		);
		let last: number | null = null;
		for (let i = 0; i < 80; i++) {
			const rms = 0.005 + i * 0.001;
			last = detector.push(frameOf(rms), i * (FRAME / SAMPLE_RATE));
		}
		expect(last).toBeNull();
	});
});
