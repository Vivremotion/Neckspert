import { describe, expect, it } from 'vitest';
import { coldAccuracyRatio } from './coldAccuracy';

describe('coldAccuracyRatio', () => {
	it('returns null when there were no cold attempts', () => {
		expect(coldAccuracyRatio(0, 0)).toBeNull();
	});

	it('returns the ratio otherwise', () => {
		expect(coldAccuracyRatio(9, 10)).toBe(0.9);
		expect(coldAccuracyRatio(0, 5)).toBe(0);
	});
});
