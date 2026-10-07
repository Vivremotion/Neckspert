import { describe, expect, it } from 'vitest';
import { COMB_INHARMONICITY } from './constants';
import { noteComb } from './comb';

const RATE = 48000;
const BINS = 4096;
const BIN_HZ = RATE / (2 * BINS);

describe('noteComb', () => {
	it('puts each partial at its inharmonic frequency with the profile amplitude', () => {
		const comb = noteComb(57, BINS, RATE, [1, 0.5]);
		const first = Math.round(220 / BIN_HZ);
		const second = Math.round((440 * Math.sqrt(1 + COMB_INHARMONICITY * 4)) / BIN_HZ);
		expect(comb[first]).toBeGreaterThan(0.9);
		expect(comb[second] / comb[first]).toBeCloseTo(0.5, 1);
		expect(comb[Math.round(660 / BIN_HZ)]).toBeLessThan(1e-6);
	});
});
