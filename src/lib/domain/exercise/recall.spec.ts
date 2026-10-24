import { describe, expect, it } from 'vitest';
import { GESTURE_EXERCISES } from '$lib/domain/gesture/exercises';
import { triadParams } from '$lib/domain/triads/items';
import { IDENTIFY_NECK, LOCATE_NECK, RHYTHM_EXERCISES, TRIADS_ANCHOR, TRIADS_ZONE } from './index';
import { recallThresholdOf } from './recall';
import type { ExerciseDefinition } from './types';

const withThreshold = (value: unknown): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { recallThresholdMs: value }
});

describe('recallThresholdOf', () => {
	it('reads the threshold an exercise declares', () => {
		expect(recallThresholdOf(LOCATE_NECK)).toBe(1500);
		expect(recallThresholdOf(IDENTIFY_NECK)).toBe(3000);
		expect(recallThresholdOf(TRIADS_ANCHOR)).toBe(1500);
		expect(recallThresholdOf(TRIADS_ZONE)).toBe(1500);
	});

	it('gives none to an exercise that declares none', () => {
		expect(GESTURE_EXERCISES.length).toBeGreaterThan(0);
		expect(RHYTHM_EXERCISES.length).toBeGreaterThan(0);
		for (const exercise of [...GESTURE_EXERCISES, ...RHYTHM_EXERCISES]) {
			expect(recallThresholdOf(exercise)).toBeNull();
		}
	});

	it('refuses a threshold that is not a positive number', () => {
		for (const value of [0, -1, '1500']) {
			expect(() => recallThresholdOf(withThreshold(value))).toThrow(
				'recallThresholdMs must be a positive number'
			);
		}
	});

	it('leaves the triads parser undisturbed by the extra key', () => {
		expect(triadParams(TRIADS_ANCHOR).stringSets.length).toBe(2);
	});
});
