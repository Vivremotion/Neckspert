import { describe, expect, it } from 'vitest';
import { whiteningGains } from './whitening';

describe('whiteningGains', () => {
	it('leaves a flat spectrum flat', () => {
		const gains = whiteningGains(new Float64Array(4096).fill(1), 48000);
		const lo = Math.min(...gains);
		const hi = Math.max(...gains);
		expect(hi / lo).toBeLessThan(1.01);
	});

	it('lifts a quiet band against a loud one', () => {
		const spectrum = new Float64Array(4096).fill(0.01);
		for (let k = 0; k < 100; k++) spectrum[k] = 1;
		const gains = whiteningGains(spectrum, 48000);
		expect(gains[2000]).toBeGreaterThan(gains[50]);
	});
});
