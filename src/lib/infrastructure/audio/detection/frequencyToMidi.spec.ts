import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { frequencyToMidi, midiFromFrequency } from './frequencyToMidi';

describe('DEFAULT_DETECTOR_CONFIG', () => {
	it('covers the playable guitar range and a long enough window for low E', () => {
		expect(DEFAULT_DETECTOR_CONFIG.minMidi).toBe(40);
		expect(DEFAULT_DETECTOR_CONFIG.maxMidi).toBe(88);
		expect(DEFAULT_DETECTOR_CONFIG.windowSize).toBeGreaterThanOrEqual(2048);
		expect(DEFAULT_DETECTOR_CONFIG.clarityThreshold).toBeGreaterThan(0);
		expect(DEFAULT_DETECTOR_CONFIG.onsetRatio).toBeGreaterThan(1);
		expect(DEFAULT_DETECTOR_CONFIG.minRms).toBeGreaterThan(0);
		expect(DEFAULT_DETECTOR_CONFIG.cooldownMs).toBeGreaterThan(0);
	});
});

describe('frequencyToMidi', () => {
	it('maps A4 and open low E', () => {
		expect(frequencyToMidi(440)).toBeCloseTo(69, 5);
		expect(frequencyToMidi(82.40689)).toBeCloseTo(40, 2);
	});
});

describe('midiFromFrequency', () => {
	it('rounds to the nearest MIDI note and clamps', () => {
		expect(midiFromFrequency(440, 40, 88)).toBe(69);
		expect(midiFromFrequency(82.40689, 40, 88)).toBe(40);
		expect(midiFromFrequency(20, 40, 88)).toBe(40);
		expect(midiFromFrequency(5000, 40, 88)).toBe(88);
	});
});
