import { describe, expect, it } from 'vitest';
import { binHz, hannWindow, maxPool } from './spectrum';

describe('hannWindow', () => {
	it('is symmetric and zero at both ends', () => {
		expect(Array.from(hannWindow(4)).map((v) => Number(v.toFixed(6)))).toEqual([0, 0.75, 0.75, 0]);
	});
});

describe('maxPool', () => {
	it('keeps a peak that only the later spectrum holds', () => {
		const pooled = new Float64Array([1, 0, 2]);
		maxPool(pooled, new Float64Array([0, 5, 1]));
		expect(Array.from(pooled)).toEqual([1, 5, 2]);
	});
});

describe('binHz', () => {
	it('is the sample rate over the transform size', () => {
		expect(binHz(48000, 8192)).toBeCloseTo(5.859375, 9);
	});
});
