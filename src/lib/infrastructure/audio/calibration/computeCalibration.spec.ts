import { describe, expect, it } from 'vitest';
import { DEFAULT_CALIBRATION_CONFIG } from './config';
import { computeCalibration } from './computeCalibration';

describe('DEFAULT_CALIBRATION_CONFIG', () => {
	it('matches the README defaults', () => {
		expect(DEFAULT_CALIBRATION_CONFIG).toEqual({
			bpm: 80,
			hitsNeeded: 10,
			maxSpreadMs: 40,
			noSoundBeats: 32
		});
	});
});

describe('computeCalibration', () => {
	it('returns null for an empty list', () => {
		expect(computeCalibration([], 40)).toBeNull();
	});

	it('returns the median offset and MAD spread, rounded', () => {
		// offsets around 38 ms with a little jitter
		const offsets = [36, 38, 37, 40, 39, 38, 41, 35, 38, 37];
		const result = computeCalibration(offsets, 40);
		expect(result).not.toBeNull();
		expect(result!.offsetMs).toBe(38);
		expect(result!.spreadMs).toBeLessThanOrEqual(40);
		expect(result!.spreadMs).toBe(1);
	});

	it('returns null when the MAD exceeds maxSpreadMs', () => {
		// median = 60; deviations = [60, 50, 40, 40, 50, 60] → MAD = 50 > 40
		const offsets = [0, 10, 20, 100, 110, 120];
		expect(computeCalibration(offsets, 40)).toBeNull();
	});

	it('accepts a spread equal to maxSpreadMs', () => {
		// median = 50; deviations = [20, 10, 0, 10, 20] → MAD = 10
		const offsets = [30, 40, 50, 60, 70];
		expect(computeCalibration(offsets, 10)).toEqual({ offsetMs: 50, spreadMs: 10 });
	});

	it('does not mutate its input', () => {
		const offsets = [3, 1, 2];
		computeCalibration(offsets, 40);
		expect(offsets).toEqual([3, 1, 2]);
	});
});
