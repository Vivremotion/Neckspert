import { describe, expect, it } from 'vitest';
import { RHYTHM_SENSOR } from '$lib/domain/time';
import { asksForHeadphones } from './clickBleed';

describe('asksForHeadphones', () => {
	it('asks them of a sensor the click would fool, once the calibration heard it', () => {
		expect(asksForHeadphones(true, RHYTHM_SENSOR)).toBe(true);
		expect(asksForHeadphones(false, RHYTHM_SENSOR)).toBe(false);
		expect(asksForHeadphones(true, 'note')).toBe(true);
		expect(asksForHeadphones(false, 'note')).toBe(false);
	});

	it('never of the chord sensor, which listens for its expected chord, nor without a sensor', () => {
		expect(asksForHeadphones(true, 'chord')).toBe(false);
		expect(asksForHeadphones(true, null)).toBe(false);
	});
});
