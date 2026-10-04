import { describe, expect, it } from 'vitest';
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, clampTempo } from './tempo';

describe('clampTempo', () => {
	it('keeps values inside 80..160', () => {
		expect(MIN_TEMPO_BPM).toBe(80);
		expect(MAX_TEMPO_BPM).toBe(160);
		expect(clampTempo(100)).toBe(100);
		expect(clampTempo(80)).toBe(80);
		expect(clampTempo(160)).toBe(160);
	});

	it('clamps below and above the user bounds', () => {
		expect(clampTempo(79)).toBe(80);
		expect(clampTempo(20)).toBe(80);
		expect(clampTempo(161)).toBe(160);
		expect(clampTempo(300)).toBe(160);
	});

	it('rounds to the nearest integer', () => {
		expect(clampTempo(80.4)).toBe(80);
		expect(clampTempo(80.6)).toBe(81);
	});
});
