import { describe, expect, it } from 'vitest';
import { median } from './stats';

describe('median', () => {
	it('returns null for an empty list', () => {
		expect(median([])).toBeNull();
	});

	it('returns the middle value, or the mean of the two middle values', () => {
		expect(median([900, 1200, 700])).toBe(900);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('does not mutate its input', () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});
});
