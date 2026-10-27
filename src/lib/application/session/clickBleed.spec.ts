import { describe, expect, it } from 'vitest';
import { RHYTHM_SENSOR } from '$lib/domain/time';
import { asksForHeadphones } from './clickBleed';

describe('asksForHeadphones', () => {
	it('asks them of a sensor that takes the click for an attack, once the calibration heard it', () => {
		expect(asksForHeadphones(true, RHYTHM_SENSOR)).toBe(true);
		expect(asksForHeadphones(false, RHYTHM_SENSOR)).toBe(false);
	});

	it('never of a sensor that reads pitches, nor without one', () => {
		expect(asksForHeadphones(true, 'note')).toBe(false);
		expect(asksForHeadphones(true, 'chord')).toBe(false);
		expect(asksForHeadphones(true, null)).toBe(false);
	});
});
