import { describe, expect, it } from 'vitest';
import { compareAttacks } from './attackShadow';

describe('compareAttacks', () => {
	it('pairs onsets with the nearest attack within 30 ms, one to one', () => {
		const stats = compareAttacks([1.0, 2.0, 3.0], [1.004, 2.05, 3.002, 4.0]);
		expect(stats).toMatchObject({ both: 2, onlyNotes: 1, onlyAttacks: 2 });
		expect(stats.biasMs).toBeCloseTo(3, 0);
	});

	it('returns null deltas without any pair', () => {
		const stats = compareAttacks([1], [5]);
		expect(stats.medianDeltaMs).toBeNull();
		expect(stats.p90AbsDeltaMs).toBeNull();
		expect(stats.biasMs).toBeNull();
		expect(stats).toMatchObject({ both: 0, onlyNotes: 1, onlyAttacks: 1 });
	});

	it('gives an attack to only one note, the nearest', () => {
		const stats = compareAttacks([1.0, 1.01], [1.012]);
		expect(stats).toMatchObject({ both: 1, onlyNotes: 1, onlyAttacks: 0 });
		expect(stats.medianDeltaMs).toBeCloseTo(2, 0);
	});

	it('signs the delta attack minus note and reports the median and the 90th percentile', () => {
		const stats = compareAttacks([1, 2, 3, 4], [0.99, 2.01, 3.02, 3.98]);
		expect(stats.both).toBe(4);
		expect(stats.biasMs).toBeCloseTo(0, 0);
		expect(stats.medianDeltaMs).toBeCloseTo(0, 0);
		expect(stats.p90AbsDeltaMs).toBeCloseTo(20, 0);
	});

	it('handles empty inputs', () => {
		expect(compareAttacks([], [])).toEqual({
			both: 0,
			onlyNotes: 0,
			onlyAttacks: 0,
			medianDeltaMs: null,
			p90AbsDeltaMs: null,
			biasMs: null
		});
	});
});
